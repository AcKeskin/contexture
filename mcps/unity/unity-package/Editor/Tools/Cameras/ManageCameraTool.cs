using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.Cameras
{
    /// <summary>
    /// Camera-specific operations beyond what go_find + component_set_property
    /// already cover. Four actions:
    ///
    ///   list  — every UnityEngine.Camera in loaded scenes with summary fields.
    ///   info  — full Camera record for one componentInstanceId.
    ///   set   — assign one or more common Camera fields by name (fov, depth,
    ///           orthographic, orthographicSize, nearClipPlane, farClipPlane,
    ///           clearFlags, backgroundColor, cullingMask, enabled). Heterogeneous
    ///           value types are accepted via a map.
    ///   look_at — rotate the Camera's transform to face a target world position.
    ///           Optional cameraPosition repositions the camera too. Persists via
    ///           EditorUtility.SetDirty + EditorSceneManager.MarkSceneDirty so the
    ///           change survives scene save.
    ///
    /// Cinemachine extensions are out of scope for this slice; agents can compose
    /// component_set_property for any Cinemachine-specific field. Adding a
    /// dedicated cinemachine path would require wiring a com.unity.cinemachine
    /// versionDefine + #if guard, parked until demand surfaces.
    /// </summary>
    [UnityMcpTool("manage_camera")]
    internal sealed class ManageCameraTool : IUnityMcpTool
    {
        public string Name => "manage_camera";

        public string Description =>
            "Camera operations. action=list|info|set|look_at. " +
            "list: every UnityEngine.Camera in loaded scenes — [{ componentInstanceId, " +
            "gameObjectInstanceId, gameObjectName, scenePath, fov, orthographic, " +
            "orthographicSize, depth, clearFlags, cullingMask, enabled }]. " +
            "info: required 'componentInstanceId'; returns full Camera record. " +
            "set: required 'componentInstanceId' + 'properties' (map of field→value). " +
            "Supported fields: fov (number), depth (number), orthographic (bool), " +
            "orthographicSize (number), nearClipPlane (number), farClipPlane (number), " +
            "clearFlags ('Skybox'|'SolidColor'|'Depth'|'Nothing'), backgroundColor " +
            "([r,g,b,a]), cullingMask (int), enabled (bool). Unknown field names " +
            "error. look_at: required 'componentInstanceId' + 'targetPosition' " +
            "([x,y,z]); optional 'cameraPosition' ([x,y,z]) repositions the camera " +
            "before rotating. Persists scene mutations.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "list", "info", "set", "look_at" },
                },
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
                ["properties"] = new JObject { ["type"] = "object" },
                ["targetPosition"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3, ["maxItems"] = 3,
                },
                ["cameraPosition"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3, ["maxItems"] = 3,
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            switch (action)
            {
                case "list":    return Task.FromResult(List());
                case "info":    return Task.FromResult(Info(GetIdOrThrow(@params)));
                case "set":     return Task.FromResult(SetProperties(GetIdOrThrow(@params), @params["properties"] as JObject));
                case "look_at": return Task.FromResult(LookAt(GetIdOrThrow(@params), @params["targetPosition"] as JArray, @params["cameraPosition"] as JArray));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be list|info|set|look_at; got '{action}'.");
            }
        }

        private static int GetIdOrThrow(JObject @params)
        {
            return @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
        }

        private static Camera ResolveCameraOrThrow(int id)
        {
            var comp = InstanceIdResolver.ComponentOrThrow(id);
            if (!(comp is Camera cam))
                throw new ToolException("InvalidInput",
                    $"componentInstanceId {id} is {comp.GetType().Name}, not a Camera.");
            return cam;
        }

        private static ToolResult List()
        {
            var items = new JArray();
            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var root in scene.GetRootGameObjects())
                {
                    foreach (var cam in root.GetComponentsInChildren<Camera>(includeInactive: true))
                    {
                        items.Add(SerializeSummary(cam, scene.path));
                    }
                }
            }
            return ToolResult.Json(new JObject
            {
                ["count"] = items.Count,
                ["items"] = items,
            });
        }

        private static ToolResult Info(int id)
        {
            var cam = ResolveCameraOrThrow(id);
            return ToolResult.Json(SerializeFull(cam));
        }

        private static ToolResult SetProperties(int id, JObject props)
        {
            if (props == null || props.Count == 0)
                throw new ToolException("InvalidInput", "'properties' must be a non-empty object.");

            var cam = ResolveCameraOrThrow(id);
            var applied = new JArray();
            foreach (var kvp in props)
            {
                ApplyOne(cam, kvp.Key, kvp.Value);
                applied.Add(kvp.Key);
            }

            EditorUtility.SetDirty(cam);
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(cam.gameObject.scene);
            return ToolResult.Json(new JObject
            {
                ["componentInstanceId"] = id,
                ["applied"] = applied,
                ["fields"] = SerializeFull(cam),
            });
        }

        private static ToolResult LookAt(int id, JArray targetArr, JArray cameraArr)
        {
            if (targetArr == null || targetArr.Count != 3)
                throw new ToolException("InvalidInput", "'targetPosition' must be a [x,y,z] number array.");

            var cam = ResolveCameraOrThrow(id);
            var target = new Vector3(targetArr[0].Value<float>(), targetArr[1].Value<float>(), targetArr[2].Value<float>());

            if (cameraArr != null)
            {
                if (cameraArr.Count != 3)
                    throw new ToolException("InvalidInput", "'cameraPosition' must be a [x,y,z] number array.");
                cam.transform.position = new Vector3(cameraArr[0].Value<float>(), cameraArr[1].Value<float>(), cameraArr[2].Value<float>());
            }

            // LookAt with a degenerate forward (target == position) leaves
            // rotation unchanged. Guard explicitly so the agent gets a clear
            // error rather than a silent no-op.
            if (Vector3.Distance(cam.transform.position, target) < 1e-5f)
                throw new ToolException("InvalidInput",
                    "Camera position equals target position; LookAt has no defined orientation. Pass a 'cameraPosition' that differs from the target.");

            cam.transform.LookAt(target, Vector3.up);

            EditorUtility.SetDirty(cam.transform);
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(cam.gameObject.scene);
            return ToolResult.Json(new JObject
            {
                ["componentInstanceId"] = id,
                ["targetPosition"] = new JArray { target.x, target.y, target.z },
                ["cameraPosition"] = new JArray { cam.transform.position.x, cam.transform.position.y, cam.transform.position.z },
                ["forward"] = new JArray { cam.transform.forward.x, cam.transform.forward.y, cam.transform.forward.z },
                ["rotationEuler"] = new JArray { cam.transform.eulerAngles.x, cam.transform.eulerAngles.y, cam.transform.eulerAngles.z },
            });
        }

        private static void ApplyOne(Camera cam, string field, JToken value)
        {
            switch (field)
            {
                case "fov":
                    cam.fieldOfView = ExpectNumber(field, value);
                    break;
                case "depth":
                    cam.depth = ExpectNumber(field, value);
                    break;
                case "orthographic":
                    cam.orthographic = ExpectBool(field, value);
                    break;
                case "orthographicSize":
                    cam.orthographicSize = ExpectNumber(field, value);
                    break;
                case "nearClipPlane":
                    cam.nearClipPlane = ExpectNumber(field, value);
                    break;
                case "farClipPlane":
                    cam.farClipPlane = ExpectNumber(field, value);
                    break;
                case "clearFlags":
                    cam.clearFlags = ParseClearFlags(value);
                    break;
                case "backgroundColor":
                {
                    var c = ExpectFloat4(field, value);
                    cam.backgroundColor = new Color(c[0], c[1], c[2], c[3]);
                    break;
                }
                case "cullingMask":
                    cam.cullingMask = ExpectInt(field, value);
                    break;
                case "enabled":
                    cam.enabled = ExpectBool(field, value);
                    break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown Camera field '{field}'. Supported: fov, depth, orthographic, orthographicSize, nearClipPlane, farClipPlane, clearFlags, backgroundColor, cullingMask, enabled.");
            }
        }

        private static float ExpectNumber(string field, JToken value)
        {
            if (value == null || (value.Type != JTokenType.Float && value.Type != JTokenType.Integer))
                throw new ToolException("InvalidInput", $"Field '{field}' expects a number.");
            return value.Value<float>();
        }

        private static int ExpectInt(string field, JToken value)
        {
            if (value == null || value.Type != JTokenType.Integer)
                throw new ToolException("InvalidInput", $"Field '{field}' expects an integer.");
            return value.Value<int>();
        }

        private static bool ExpectBool(string field, JToken value)
        {
            if (value == null || value.Type != JTokenType.Boolean)
                throw new ToolException("InvalidInput", $"Field '{field}' expects a boolean.");
            return value.Value<bool>();
        }

        private static float[] ExpectFloat4(string field, JToken value)
        {
            if (!(value is JArray arr) || arr.Count != 4)
                throw new ToolException("InvalidInput", $"Field '{field}' expects a 4-element [r,g,b,a] array.");
            var f = new float[4];
            for (int i = 0; i < 4; i++) f[i] = arr[i].Value<float>();
            return f;
        }

        private static CameraClearFlags ParseClearFlags(JToken value)
        {
            var s = value?.Value<string>();
            switch (s)
            {
                case "Skybox":      return CameraClearFlags.Skybox;
                case "SolidColor":  return CameraClearFlags.SolidColor;
                case "Depth":       return CameraClearFlags.Depth;
                case "Nothing":     return CameraClearFlags.Nothing;
                default:
                    throw new ToolException("InvalidInput",
                        $"clearFlags must be one of Skybox|SolidColor|Depth|Nothing; got '{s}'.");
            }
        }

        private static JObject SerializeSummary(Camera cam, string scenePath)
        {
            return new JObject
            {
                ["componentInstanceId"] = cam.GetInstanceID(),
                ["gameObjectInstanceId"] = cam.gameObject.GetInstanceID(),
                ["gameObjectName"] = cam.gameObject.name,
                ["scenePath"] = scenePath ?? string.Empty,
                ["fov"] = cam.fieldOfView,
                ["orthographic"] = cam.orthographic,
                ["orthographicSize"] = cam.orthographicSize,
                ["depth"] = cam.depth,
                ["clearFlags"] = cam.clearFlags.ToString(),
                ["cullingMask"] = cam.cullingMask,
                ["enabled"] = cam.enabled,
            };
        }

        private static JObject SerializeFull(Camera cam)
        {
            var t = cam.transform;
            return new JObject
            {
                ["componentInstanceId"] = cam.GetInstanceID(),
                ["gameObjectInstanceId"] = cam.gameObject.GetInstanceID(),
                ["gameObjectName"] = cam.gameObject.name,
                ["scenePath"] = cam.gameObject.scene.path ?? string.Empty,
                ["fov"] = cam.fieldOfView,
                ["depth"] = cam.depth,
                ["orthographic"] = cam.orthographic,
                ["orthographicSize"] = cam.orthographicSize,
                ["nearClipPlane"] = cam.nearClipPlane,
                ["farClipPlane"] = cam.farClipPlane,
                ["clearFlags"] = cam.clearFlags.ToString(),
                ["backgroundColor"] = new JArray { cam.backgroundColor.r, cam.backgroundColor.g, cam.backgroundColor.b, cam.backgroundColor.a },
                ["cullingMask"] = cam.cullingMask,
                ["enabled"] = cam.enabled,
                ["aspect"] = cam.aspect,
                ["pixelWidth"] = cam.pixelWidth,
                ["pixelHeight"] = cam.pixelHeight,
                ["position"] = new JArray { t.position.x, t.position.y, t.position.z },
                ["rotationEuler"] = new JArray { t.eulerAngles.x, t.eulerAngles.y, t.eulerAngles.z },
                ["forward"] = new JArray { t.forward.x, t.forward.y, t.forward.z },
            };
        }
    }
}
