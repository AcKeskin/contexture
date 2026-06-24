using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Advances exactly one frame while play mode is paused (<c>EditorApplication.Step</c>), for
    /// frame-by-frame observation paired with view_game / profiler_capture. Requires PAUSED play
    /// mode — throws ToolException('InvalidInput') when stopped or running-unpaused. Reuses the
    /// play-state semantics from <see cref="PlayModeTransition"/>.
    /// </summary>
    [UnityMcpTool("playmode_step")]
    internal sealed class PlaymodeStepTool : IUnityMcpTool
    {
        public string Name => "playmode_step";

        public string Description =>
            "Advance exactly ONE frame while play mode is PAUSED (EditorApplication.Step). For " +
            "frame-by-frame observation paired with view_game / profiler_capture. No inputs. " +
            "Requires paused play mode — throws ToolException('InvalidInput') when stopped or " +
            "running-unpaused (use playmode_set 'paused' first). Returns { stepped:true, " +
            "frameCount } where frameCount is Time.frameCount after the step.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!EditorApplication.isPlaying)
                throw new ToolException("InvalidInput",
                    "playmode_step requires play mode — enter paused play (playmode_set 'paused') first.");
            if (!EditorApplication.isPaused)
                throw new ToolException("InvalidInput",
                    "playmode_step requires PAUSED play mode — pause first (playmode_set 'paused'); a running play loop advances frames on its own.");

            EditorApplication.Step();

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["stepped"] = true,
                ["frameCount"] = Time.frameCount,
            }));
        }
    }
}
