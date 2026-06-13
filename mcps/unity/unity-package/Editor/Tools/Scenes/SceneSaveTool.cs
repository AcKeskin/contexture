using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor.SceneManagement;

namespace UnityMcp.Editor.Tools.Scenes
{
    /// <summary>
    /// Saves the active scene if dirty. Errors with InvalidInput when no active scene
    /// exists or the active scene is untitled (no asset path).
    /// </summary>
    [UnityMcpTool("scene_save")]
    internal sealed class SceneSaveTool : IUnityMcpTool
    {
        public string Name => "scene_save";

        public string Description =>
            "Save the active scene. Errors if there is no active scene or the active scene is untitled. " +
            "Returns whether the scene was actually written (false when not dirty).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var active = EditorSceneManager.GetActiveScene();
            if (!active.IsValid() || !active.isLoaded)
            {
                throw new ArgumentException("No active loaded scene to save.");
            }
            if (string.IsNullOrEmpty(active.path))
            {
                throw new ArgumentException("Active scene is untitled. Save-As is not supported by this tool.");
            }

            bool wasDirty = active.isDirty;
            bool saved = wasDirty && EditorSceneManager.SaveScene(active);

            var data = new JObject
            {
                ["name"] = active.name ?? string.Empty,
                ["path"] = active.path,
                ["wasDirty"] = wasDirty,
                ["saved"] = saved,
            };

            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
