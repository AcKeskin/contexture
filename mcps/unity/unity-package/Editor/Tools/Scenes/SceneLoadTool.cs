using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.Scenes
{
    /// <summary>
    /// Opens a scene by asset path. Mode 'single' (default) replaces all loaded scenes;
    /// 'additive' adds the scene without unloading current ones. Errors with InvalidInput
    /// when the asset path doesn't resolve.
    /// </summary>
    [UnityMcpTool("scene_load")]
    internal sealed class SceneLoadTool : IUnityMcpTool
    {
        public string Name => "scene_load";

        public string Description =>
            "Open a scene asset by path. 'mode' is 'single' (default — closes other scenes) " +
            "or 'additive' (adds without unloading). Returns the loaded scene's name + path.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Asset-relative scene path, e.g. 'Assets/Scenes/Sample.unity'.",
                },
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "single", "additive" },
                    ["default"] = "single",
                },
            },
            ["required"] = new JArray { "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("'path' is required.");
            }

            string modeStr = @params.Value<string>("mode") ?? "single";
            if (!Enum.TryParse<OpenSceneMode>(modeStr == "single" ? "Single" : "Additive", out var mode))
            {
                throw new ArgumentException($"Unknown mode '{modeStr}'.");
            }

            // Asset existence: AssetDatabase, not File.Exists — package-relative paths
            // would also work but the spec contract is "Assets/...". Cheap to check first.
            if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path) == null && !File.Exists(path))
            {
                throw new ArgumentException($"Scene asset not found at '{path}'.");
            }

            var scene = EditorSceneManager.OpenScene(path, mode);

            var data = new JObject
            {
                ["name"] = scene.name ?? string.Empty,
                ["path"] = scene.path ?? string.Empty,
                ["mode"] = modeStr,
                ["isLoaded"] = scene.isLoaded,
            };

            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
