using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.ProjectSettings
{
    /// <summary>
    /// Project-wide settings: Tags, Layers, Quality. These live in
    /// ProjectSettings/*.asset and are normally only writable through the
    /// Project Settings window — this tool exposes a programmatic surface so
    /// agents can resolve layerMask names symbolically (which manage_physics
    /// already accepts as string[]) and add tags before assigning them via
    /// component_set_property.
    ///
    /// Six actions:
    ///
    ///   tags        — read the full Tags array.
    ///   add_tag     — append a tag (no-op if it already exists).
    ///   remove_tag  — drop a tag by name (no-op if absent). Built-in
    ///                 tags ("Untagged", "Respawn", etc.) are protected.
    ///   layers      — read all 32 layer slots [{ index, name }]. Empty
    ///                 slots are included so callers see holes.
    ///   set_layer   — assign a name to a user-defined layer slot (8..31).
    ///                 Built-in slots 0..7 are protected.
    ///   quality     — read QualitySettings: active level, names list, and
    ///                 a few key fields (vSyncCount, antiAliasing,
    ///                 shadowDistance, anisotropicFiltering).
    ///
    /// Out of scope for this slice: PlayerSettings (build-target settings),
    /// PhysicsSettings (covered by manage_physics), GraphicsSettings (URP
    /// versionDefine work parked).
    /// </summary>
    [UnityMcpTool("manage_project_settings")]
    internal sealed class ManageProjectSettingsTool : IUnityMcpTool
    {
        public string Name => "manage_project_settings";

        public string Description =>
            "Project Settings ops. action=tags|add_tag|remove_tag|layers|set_layer|quality. " +
            "tags: returns { tags: [...] }. " +
            "add_tag: required 'tag' string; returns { tags, added }. No-op if tag exists. " +
            "remove_tag: required 'tag' string; returns { tags, removed }. Built-in tags " +
            "(Untagged, Respawn, Finish, EditorOnly, MainCamera, Player, GameController) " +
            "cannot be removed. " +
            "layers: returns { layers: [{ index, name }] } — all 32 slots; built-in 0..7 " +
            "are read-only ('Default', 'TransparentFX', 'Ignore Raycast', 'Water', 'UI', " +
            "and three reserved). User-defined slots 8..31 may be empty. " +
            "set_layer: required 'index' (8..31) + 'name' string. Pass empty 'name' to clear " +
            "the slot. " +
            "quality: returns { activeLevel, names: [...], current: { vSyncCount, antiAliasing, " +
            "shadowDistance, anisotropicFiltering } }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "tags", "add_tag", "remove_tag", "layers", "set_layer", "quality" },
                },
                ["tag"] = new JObject { ["type"] = "string" },
                ["index"] = new JObject { ["type"] = "integer", ["minimum"] = 8, ["maximum"] = 31 },
                ["name"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            switch (action)
            {
                case "tags":       return Task.FromResult(ReadTags());
                case "add_tag":    return Task.FromResult(AddTag(@params.Value<string>("tag")));
                case "remove_tag": return Task.FromResult(RemoveTag(@params.Value<string>("tag")));
                case "layers":     return Task.FromResult(ReadLayers());
                case "set_layer":  return Task.FromResult(SetLayer(@params));
                case "quality":    return Task.FromResult(ReadQuality());
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be tags|add_tag|remove_tag|layers|set_layer|quality; got '{action}'.");
            }
        }

        // ------------------------------------------------------------------
        // Tags
        // ------------------------------------------------------------------

        private static readonly string[] BuiltinTags =
        {
            "Untagged", "Respawn", "Finish", "EditorOnly",
            "MainCamera", "Player", "GameController",
        };

        private static SerializedObject LoadTagManager()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0)
                throw new ToolException("Internal", "TagManager.asset could not be loaded.");
            return new SerializedObject(assets[0]);
        }

        private static ToolResult ReadTags()
        {
            // InternalEditorUtility.tags includes built-ins; expose as-is.
            var tags = UnityEditorInternal.InternalEditorUtility.tags;
            var arr = new JArray();
            foreach (var t in tags) arr.Add(t);
            return ToolResult.Json(new JObject { ["tags"] = arr });
        }

        private static ToolResult AddTag(string tag)
        {
            if (string.IsNullOrEmpty(tag))
                throw new ToolException("InvalidInput", "'tag' is required for action=add_tag.");

            var existing = UnityEditorInternal.InternalEditorUtility.tags;
            foreach (var t in existing)
            {
                if (t == tag)
                {
                    return ToolResult.Json(new JObject
                    {
                        ["tags"] = TagsToArray(existing),
                        ["added"] = false,
                    });
                }
            }

            var so = LoadTagManager();
            var tagsProp = so.FindProperty("tags");
            int idx = tagsProp.arraySize;
            tagsProp.InsertArrayElementAtIndex(idx);
            tagsProp.GetArrayElementAtIndex(idx).stringValue = tag;
            so.ApplyModifiedProperties();
            AssetDatabase.SaveAssetIfDirty(so.targetObject);

            return ToolResult.Json(new JObject
            {
                ["tags"] = TagsToArray(UnityEditorInternal.InternalEditorUtility.tags),
                ["added"] = true,
            });
        }

        private static ToolResult RemoveTag(string tag)
        {
            if (string.IsNullOrEmpty(tag))
                throw new ToolException("InvalidInput", "'tag' is required for action=remove_tag.");

            foreach (var b in BuiltinTags)
            {
                if (b == tag)
                    throw new ToolException("InvalidInput",
                        $"'{tag}' is a built-in tag and cannot be removed.");
            }

            var so = LoadTagManager();
            var tagsProp = so.FindProperty("tags");
            for (int i = 0; i < tagsProp.arraySize; i++)
            {
                if (tagsProp.GetArrayElementAtIndex(i).stringValue == tag)
                {
                    tagsProp.DeleteArrayElementAtIndex(i);
                    so.ApplyModifiedProperties();
                    AssetDatabase.SaveAssetIfDirty(so.targetObject);
                    return ToolResult.Json(new JObject
                    {
                        ["tags"] = TagsToArray(UnityEditorInternal.InternalEditorUtility.tags),
                        ["removed"] = true,
                    });
                }
            }

            return ToolResult.Json(new JObject
            {
                ["tags"] = TagsToArray(UnityEditorInternal.InternalEditorUtility.tags),
                ["removed"] = false,
            });
        }

        private static JArray TagsToArray(string[] tags)
        {
            var arr = new JArray();
            foreach (var t in tags) arr.Add(t);
            return arr;
        }

        // ------------------------------------------------------------------
        // Layers
        // ------------------------------------------------------------------

        private static ToolResult ReadLayers()
        {
            var arr = new JArray();
            for (int i = 0; i < 32; i++)
            {
                arr.Add(new JObject
                {
                    ["index"] = i,
                    ["name"] = LayerMask.LayerToName(i) ?? string.Empty,
                });
            }
            return ToolResult.Json(new JObject { ["layers"] = arr });
        }

        private static ToolResult SetLayer(JObject @params)
        {
            int? indexOpt = @params.Value<int?>("index");
            if (indexOpt == null)
                throw new ToolException("InvalidInput", "'index' is required for action=set_layer.");
            int index = indexOpt.Value;
            if (index < 8 || index > 31)
                throw new ToolException("InvalidInput",
                    $"layer index must be 8..31 (built-in slots 0..7 are read-only); got {index}.");

            var name = @params.Value<string>("name") ?? string.Empty;

            var so = LoadTagManager();
            var layersProp = so.FindProperty("layers");
            if (layersProp == null || layersProp.arraySize <= index)
                throw new ToolException("Internal", "TagManager.asset 'layers' property has unexpected shape.");

            var elem = layersProp.GetArrayElementAtIndex(index);
            elem.stringValue = name;
            so.ApplyModifiedProperties();
            AssetDatabase.SaveAssetIfDirty(so.targetObject);

            return ToolResult.Json(new JObject
            {
                ["index"] = index,
                ["name"] = name,
                ["layers"] = ((JObject)((JToken)ReadLayers().Data))["layers"],
            });
        }

        // ------------------------------------------------------------------
        // Quality
        // ------------------------------------------------------------------

        private static ToolResult ReadQuality()
        {
            var names = QualitySettings.names;
            var namesArr = new JArray();
            foreach (var n in names) namesArr.Add(n);

            var current = new JObject
            {
                ["vSyncCount"] = QualitySettings.vSyncCount,
                ["antiAliasing"] = QualitySettings.antiAliasing,
                ["shadowDistance"] = QualitySettings.shadowDistance,
                ["anisotropicFiltering"] = QualitySettings.anisotropicFiltering.ToString(),
            };

            return ToolResult.Json(new JObject
            {
                ["activeLevel"] = QualitySettings.GetQualityLevel(),
                ["names"] = namesArr,
                ["current"] = current,
            });
        }
    }
}
