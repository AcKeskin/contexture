using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Scenes
{
    /// <summary>
    /// Creates a new scene. By default the scene is seeded with the standard
    /// GameObjects a Unity user expects from File &gt; New Scene (Main Camera +
    /// Directional Light) — an EmptyScene comes out with neither, which reads as
    /// "not a valid scene" downstream. Pass setup=empty to opt out.
    ///
    /// XR awareness: when the project has MRTK or XRI installed and setup=default,
    /// the tool tries to instantiate an XR rig from a project-provided template
    /// prefab (explicit 'rigPrefab' path wins; otherwise the first prefab labelled
    /// 'McpRigTemplate'). Faithful rig construction is version-specific and
    /// project-specific, so we do NOT synthesize a rig in code — if no template is
    /// found we still seed the Main Camera and report rigSeeded=false with a hint,
    /// rather than leaving a half-built rig that looks valid but isn't.
    ///
    /// With 'path' supplied the scene is saved immediately and added to the
    /// AssetDatabase. Without 'path' it stays in-memory until something else saves it.
    /// </summary>
    [UnityMcpTool("scene_create")]
    internal sealed class SceneCreateTool : IUnityMcpTool
    {
        /// <summary>Label a prefab with this to make it scene_create's default XR rig template.</summary>
        private const string RigTemplateLabel = "McpRigTemplate";

        public string Name => "scene_create";

        public string Description =>
            "Create a new scene seeded with standard GameObjects. " +
            "setup='default' (Main Camera + Directional Light, like File>New Scene) or 'empty' " +
            "(no GameObjects). Default 'default'. " +
            "includeEventSystem (default false): also add an EventSystem (for UI / XRI input scenes). " +
            "When MRTK/XRI is installed and setup='default', an XR rig is instantiated from a template " +
            "prefab — 'rigPrefab' (asset path) if given, else the first prefab labelled '" +
            RigTemplateLabel + "'; if none is found the Main Camera is still seeded and rigSeeded=false " +
            "is returned with a hint. " +
            "Optional 'path' (e.g. 'Assets/Scenes/New.unity') saves immediately. " +
            "mode='single' (default, closes other scenes) or 'additive'. " +
            "Returns { name, path, mode, saved, setup, seeded: { camera, light, eventSystem }, " +
            "rigSeeded, rig?, rigHint? }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Optional asset-relative path to save the new scene at.",
                },
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "single", "additive" },
                    ["default"] = "single",
                },
                ["setup"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "default", "empty" },
                    ["default"] = "default",
                    ["description"] = "'default' seeds Main Camera + Directional Light; 'empty' seeds nothing.",
                },
                ["includeEventSystem"] = new JObject
                {
                    ["type"] = "boolean",
                    ["description"] = "Also create an EventSystem GameObject. Default false.",
                },
                ["rigPrefab"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] =
                        "Asset path to an XR rig template prefab to instantiate when MRTK/XRI is present. " +
                        "Overrides the '" + RigTemplateLabel + "' label lookup.",
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            string modeStr = @params.Value<string>("mode") ?? "single";
            string setup = @params.Value<string>("setup") ?? "default";
            bool includeEventSystem = @params.Value<bool?>("includeEventSystem") ?? false;
            string rigPrefab = @params.Value<string>("rigPrefab");

            if (setup != "default" && setup != "empty")
                throw new ToolException("InvalidInput", $"'setup' must be 'default' or 'empty'; got '{setup}'.");

            var setupMode = modeStr == "additive" ? NewSceneMode.Additive : NewSceneMode.Single;

            // Always start from EmptyScene and seed deterministically ourselves —
            // NewSceneSetup.DefaultGameObjects bakes in a camera + light but gives no
            // control over EventSystem or XR rigs, and its contents drift across Unity
            // versions. Explicit seeding keeps the result predictable.
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, setupMode);

            bool cameraSeeded = false;
            bool lightSeeded = false;
            bool eventSystemSeeded = false;
            bool rigSeeded = false;
            string rigPath = null;
            string rigHint = null;

            if (setup == "default")
            {
                var caps = CapabilityDetector.Detect();
                bool xrProject = caps.Has(CapabilityKey.Mrtk) || caps.Has(CapabilityKey.Xri);

                if (xrProject)
                {
                    var prefab = ResolveRigTemplate(rigPrefab);
                    if (prefab != null)
                    {
                        var rigInstance = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
                        rigInstance.transform.SetAsFirstSibling();
                        rigSeeded = true;
                        rigPath = AssetDatabase.GetAssetPath(prefab);
                    }
                    else
                    {
                        // No template — fall back to a bare camera and tell the caller the rig
                        // wasn't seeded so it can add an XR Origin / MRTK rig deliberately.
                        rigHint = rigPrefab != null
                            ? $"No prefab found at rigPrefab='{rigPrefab}'. Seeded a Main Camera instead."
                            : $"MRTK/XRI detected but no prefab labelled '{RigTemplateLabel}' was found. " +
                              "Seeded a Main Camera instead; add an XR rig template and re-run, or build the rig explicitly.";
                    }
                }

                // A non-XR project (or XR project with no rig template) still needs a camera.
                if (!rigSeeded)
                {
                    CreateMainCamera();
                    cameraSeeded = true;
                    CreateDirectionalLight();
                    lightSeeded = true;
                }
            }

            if (includeEventSystem)
            {
                eventSystemSeeded = CreateEventSystem();
            }

            bool saved = false;
            if (!string.IsNullOrWhiteSpace(path))
            {
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                saved = EditorSceneManager.SaveScene(scene, path);
            }

            var data = new JObject
            {
                ["name"] = scene.name ?? string.Empty,
                ["path"] = scene.path ?? string.Empty,
                ["mode"] = modeStr,
                ["saved"] = saved,
                ["setup"] = setup,
                ["seeded"] = new JObject
                {
                    ["camera"] = cameraSeeded,
                    ["light"] = lightSeeded,
                    ["eventSystem"] = eventSystemSeeded,
                },
                ["rigSeeded"] = rigSeeded,
            };
            if (rigPath != null) data["rig"] = rigPath;
            if (rigHint != null) data["rigHint"] = rigHint;

            return Task.FromResult(ToolResult.Json(data));
        }

        private static Object ResolveRigTemplate(string explicitPath)
        {
            if (!string.IsNullOrWhiteSpace(explicitPath))
            {
                return AssetDatabase.LoadAssetAtPath<GameObject>(explicitPath);
            }

            // Convention: the first prefab labelled RigTemplateLabel. Project opts in by
            // labelling its rig prefab; zero config beyond that.
            var guids = AssetDatabase.FindAssets($"l:{RigTemplateLabel} t:Prefab");
            if (guids.Length == 0) return null;
            var prefabPath = AssetDatabase.GUIDToAssetPath(guids[0]);
            return AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        }

        private static void CreateMainCamera()
        {
            var go = new GameObject("Main Camera");
            go.tag = "MainCamera";
            var cam = go.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.Skybox;
            go.AddComponent<AudioListener>();
            go.transform.position = new Vector3(0f, 1f, -10f);
        }

        private static void CreateDirectionalLight()
        {
            var go = new GameObject("Directional Light");
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1f;
            go.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
        }

        /// <summary>
        /// Add an EventSystem via the UI assembly when available. Returns false (rather
        /// than throwing) if the UI module isn't referenced — the scene is still valid.
        /// </summary>
        private static bool CreateEventSystem()
        {
            var eventSystemType = System.Type.GetType("UnityEngine.EventSystems.EventSystem, UnityEngine.UI");
            var inputModuleType = System.Type.GetType("UnityEngine.EventSystems.StandaloneInputModule, UnityEngine.UI");
            if (eventSystemType == null)
            {
                return false;
            }

            var go = new GameObject("EventSystem");
            go.AddComponent(eventSystemType);
            if (inputModuleType != null)
            {
                go.AddComponent(inputModuleType);
            }
            return true;
        }
    }
}
