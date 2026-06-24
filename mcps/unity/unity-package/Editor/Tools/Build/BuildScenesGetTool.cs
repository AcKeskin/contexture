using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Reads the current build scene list (<c>EditorBuildSettings.scenes</c>) as
    /// { scenes: [{ path, enabled }] } in build order. Read-only — registers no Undo, marks
    /// nothing dirty. Pair with build_scenes_set to verify an edit by reading the list back.
    /// </summary>
    [UnityMcpTool("build_scenes_get")]
    internal sealed class BuildScenesGetTool : IUnityMcpTool
    {
        public string Name => "build_scenes_get";

        public string Description =>
            "Read the build scene list from EditorBuildSettings.scenes in build order. No inputs. " +
            "Returns { scenes: [{ path, enabled }] }. Read-only. Use build_scenes_set to edit, " +
            "then call this again to confirm.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var scenes = new JArray();
            foreach (var scene in EditorBuildSettings.scenes)
            {
                scenes.Add(new JObject
                {
                    ["path"] = scene.path ?? string.Empty,
                    ["enabled"] = scene.enabled,
                });
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["scenes"] = scenes,
            }));
        }
    }
}
