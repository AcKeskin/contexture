using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace UnityMcp.Editor.Tools.Scenes
{
    /// <summary>
    /// Sets the active scene by asset path. The active scene receives newly-created
    /// GameObjects and is the lighting/skybox owner in multi-scene editing. Errors if
    /// the requested scene is not currently loaded.
    /// </summary>
    [UnityMcpTool("scene_set_active")]
    internal sealed class SceneSetActiveTool : IUnityMcpTool
    {
        public string Name => "scene_set_active";

        public string Description =>
            "Set the active scene among loaded scenes. The active scene owns lighting/skybox " +
            "and is the default parent for newly-created GameObjects. Pass the scene's asset path.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Asset-relative path of a currently-loaded scene.",
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

            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (scene.path == path)
                {
                    if (!scene.isLoaded)
                    {
                        throw new ArgumentException($"Scene '{path}' is registered but not loaded.");
                    }
                    if (!SceneManager.SetActiveScene(scene))
                    {
                        throw new InvalidOperationException($"SetActiveScene('{path}') returned false.");
                    }

                    var data = new JObject
                    {
                        ["name"] = scene.name ?? string.Empty,
                        ["path"] = scene.path ?? string.Empty,
                    };
                    return Task.FromResult(ToolResult.Json(data));
                }
            }

            // Help the agent recover: list what's loaded.
            var loaded = new JArray();
            for (int i = 0; i < sceneCount; i++)
            {
                var s = SceneManager.GetSceneAt(i);
                loaded.Add(s.path ?? string.Empty);
            }
            throw new ArgumentException(
                $"Scene '{path}' not loaded. Loaded scenes: [{string.Join(", ", loaded)}]");
        }
    }
}
