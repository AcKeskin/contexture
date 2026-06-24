using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// In-memory state for one player build kicked by <c>build_player</c> and polled by
    /// <c>build_status</c>. Owned by <see cref="BuildJobRegistry"/>. Holds the build inputs,
    /// a live status, and — once the build finishes — the mapped <see cref="UnityEditor.Build.Reporting.BuildReport"/>
    /// summary. Never surfaces a raw exception: a build that throws is recorded as
    /// <see cref="BuildStatus.Failed"/> with the message folded into <see cref="Summary"/>.
    ///
    /// Realizes the spec's async contract WITHOUT a background thread: the registry schedules
    /// the (synchronous, main-thread) <c>BuildPipeline.BuildPlayer</c> call onto a later
    /// <c>EditorApplication.delayCall</c> tick, so the MCP wire call that created the job
    /// returns immediately while the build runs on the main thread on the next tick.
    /// </summary>
    internal sealed class BuildJob
    {
        public string Handle { get; }
        public BuildPlayerOptions Options { get; }

        // Status + Summary are mutated only by BuildJobRegistry.RunBuild as the build resolves —
        // internal set keeps the state transition owned by the registry, not any holder of the job.
        public BuildStatus Status { get; internal set; }

        /// <summary>
        /// The mapped build summary once terminal — null while running.
        /// Shape: { result, totalErrors, errors:[...], outputPath, totalSizeBytes, durationMs }.
        /// </summary>
        public JObject Summary { get; internal set; }

        public BuildJob(string handle, BuildPlayerOptions options)
        {
            Handle = handle;
            Options = options;
            Status = BuildStatus.Running;
            Summary = null;
        }
    }

    /// <summary>Lifecycle of a <see cref="BuildJob"/>. Serialized lowercase to the wire.</summary>
    internal enum BuildStatus
    {
        Running,
        Succeeded,
        Failed,
    }

    internal static class BuildStatusExtensions
    {
        /// <summary>Wire form: "running" | "succeeded" | "failed".</summary>
        public static string Wire(this BuildStatus status)
        {
            switch (status)
            {
                case BuildStatus.Succeeded: return "succeeded";
                case BuildStatus.Failed: return "failed";
                default: return "running";
            }
        }
    }
}
