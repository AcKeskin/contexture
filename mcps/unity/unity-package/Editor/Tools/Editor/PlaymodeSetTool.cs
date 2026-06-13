using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Live Play Mode control: enter play, pause, or exit Play Mode and bound-await
    /// the transition before returning. Delegates the transition mechanics
    /// (compile-wait, dirty-scene save, isPlaying/isPaused flips, yield-poll) to
    /// <see cref="PlayModeTransition"/>, the single owner of that logic.
    ///
    /// Failure surfaces as <c>ToolException("TransitionTimeout", Details: { requestedState,
    /// observedState, elapsedMs })</c>. Idempotent across all three target states.
    /// </summary>
    [UnityMcpTool("playmode_set")]
    internal sealed class PlaymodeSetTool : IUnityMcpTool
    {
        private const int DefaultTimeoutMs = PlayModeTransition.DefaultTimeoutMs;
        private const int MinTimeoutMs = PlayModeTransition.MinTimeoutMs;
        private const int MaxTimeoutMs = PlayModeTransition.MaxTimeoutMs;

        public string Name => "playmode_set";

        public string Description =>
            "Enter Play Mode, pause, or exit Play Mode, then bounded-await the " +
            "transition before returning. Required: 'state' = 'play' | 'paused' | " +
            "'stopped'. Optional 'timeoutMs' (default 10000, min 1000, max 60000) " +
            "caps the wait for Unity to reach the requested state. Optional " +
            "'saveDirtyScenes' (default true) auto-saves any modified scenes before " +
            "entering Play Mode — Unity otherwise blocks on a modal save dialog. " +
            "Returns { previous, current, transitionMs }. Idempotent: requesting " +
            "the current state is a no-op with transitionMs < frame budget. On " +
            "timeout throws ToolException('TransitionTimeout') with Details: " +
            "{ requestedState, observedState, elapsedMs }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["state"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "play", "paused", "stopped" },
                },
                ["timeoutMs"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = MinTimeoutMs,
                    ["maximum"] = MaxTimeoutMs,
                    ["default"] = DefaultTimeoutMs,
                },
                ["saveDirtyScenes"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = true,
                },
            },
            ["required"] = new JArray { "state" },
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var state = @params.Value<string>("state");
            if (string.IsNullOrEmpty(state))
                throw new ToolException("InvalidInput", "'state' is required.");
            if (state != "play" && state != "paused" && state != "stopped")
                throw new ToolException("InvalidInput",
                    $"state must be 'play', 'paused', or 'stopped'; got '{state}'.");

            int timeoutMs = @params.Value<int?>("timeoutMs") ?? DefaultTimeoutMs;
            bool saveDirtyScenes = @params.Value<bool?>("saveDirtyScenes") ?? true;

            var result = await PlayModeTransition.TransitionTo(state, timeoutMs, saveDirtyScenes);
            return ToolResult.Json(result);
        }
    }
}
