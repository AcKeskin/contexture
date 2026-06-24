using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Replaces the build scene list (<c>EditorBuildSettings.scenes</c>) with a full new list —
    /// this is a whole-list replacement (set / reorder / enable), not a merge. Validates every
    /// path resolves to a SceneAsset before writing (writes nothing on a bad path), then reads
    /// the written list back so the caller can confirm the edit (criterion 2). Mutates Editor
    /// build settings, not scene/asset content — registers no Undo.
    /// </summary>
    [UnityMcpTool("build_scenes_set")]
    internal sealed class BuildScenesSetTool : IUnityMcpTool
    {
        public string Name => "build_scenes_set";

        public string Description =>
            "Replace the build scene list (full-list replacement — set / reorder / enable, NOT a " +
            "merge). Required 'scenes' = [{ path:string, enabled:bool }] in the desired build " +
            "order. Every path must resolve to a scene asset; an unknown path throws " +
            "ToolException('InvalidInput') and writes nothing. Returns { scenes: [{ path, " +
            "enabled }] } read back from EditorBuildSettings.scenes after the write.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["scenes"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JObject
                        {
                            ["path"] = new JObject { ["type"] = "string" },
                            ["enabled"] = new JObject { ["type"] = "boolean", ["default"] = true },
                        },
                        ["required"] = new JArray { "path" },
                        ["additionalProperties"] = false,
                    },
                },
            },
            ["required"] = new JArray { "scenes" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!(@params["scenes"] is JArray sceneArray))
                throw new ToolException("InvalidInput", "'scenes' is required and must be an array.");

            // Validate ALL paths before writing — a partial write on a bad path mid-list would
            // leave the build settings in a surprising state.
            var entries = new List<EditorBuildSettingsScene>(sceneArray.Count);
            foreach (var token in sceneArray)
            {
                if (!(token is JObject sceneObj))
                    throw new ToolException("InvalidInput", "each 'scenes' entry must be an object { path, enabled }.");

                var path = sceneObj.Value<string>("path");
                if (string.IsNullOrWhiteSpace(path))
                    throw new ToolException("InvalidInput", "each 'scenes' entry needs a non-empty 'path'.");

                var asset = AssetDatabase.LoadAssetAtPath<SceneAsset>(path);
                if (asset == null)
                    throw new ToolException("InvalidInput", $"scene not found: '{path}'.");

                bool enabled = sceneObj.Value<bool?>("enabled") ?? true;
                entries.Add(new EditorBuildSettingsScene(path, enabled));
            }

            EditorBuildSettings.scenes = entries.ToArray();

            // Read back the written list so the caller can confirm the edit landed.
            var readBack = new JArray();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                readBack.Add(new JObject
                {
                    ["path"] = scene.path ?? string.Empty,
                    ["enabled"] = scene.enabled,
                });
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["scenes"] = readBack,
            }));
        }
    }
}
