using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Polls a build kicked by <c>build_player</c>. Cheap synchronous read of
    /// <see cref="BuildJobRegistry"/>: a running job returns { status:"running" }; a finished job
    /// returns { status, summary } with the mapped BuildReport. A broken build reports
    /// status:"failed" with the error messages in summary.errors — structurally, never as a raw
    /// exception. An unknown/evicted handle is an InvalidInput.
    /// </summary>
    [UnityMcpTool("build_status")]
    internal sealed class BuildStatusTool : IUnityMcpTool
    {
        public string Name => "build_status";

        public string Description =>
            "Poll a build started by build_player. Required 'buildHandle' (from build_player). " +
            "Returns { status: 'running' | 'succeeded' | 'failed', summary?: { result, " +
            "totalErrors, errors:[...], outputPath, totalSizeBytes, durationMs } }. 'summary' is " +
            "present once the build is terminal. A broken build returns status:'failed' with the " +
            "error messages in summary.errors (NOT a raw exception). Unknown or evicted handle " +
            "(only the last 8 completed builds are retained) throws " +
            "ToolException('InvalidInput', 'unknown buildHandle').";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["buildHandle"] = new JObject
                {
                    ["type"] = "string",
                },
            },
            ["required"] = new JArray { "buildHandle" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var handle = @params.Value<string>("buildHandle");
            if (string.IsNullOrWhiteSpace(handle))
                throw new ToolException("InvalidInput", "'buildHandle' is required.");

            var job = BuildJobRegistry.Get(handle);
            if (job == null)
                throw new ToolException("InvalidInput", $"unknown buildHandle '{handle}'.");

            var result = new JObject
            {
                ["status"] = job.Status.Wire(),
            };
            if (job.Summary != null)
                result["summary"] = job.Summary;

            return Task.FromResult(ToolResult.Json(result));
        }
    }
}
