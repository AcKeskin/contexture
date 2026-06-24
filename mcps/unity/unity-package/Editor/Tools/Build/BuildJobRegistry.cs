using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Build
{
    /// <summary>
    /// Owns the <c>handle → <see cref="BuildJob"/></c> map and realizes the spec's async-build
    /// contract WITHOUT a background thread (the <c>csharp/unity-interop</c> main-thread-guard
    /// rule forbids running <c>BuildPipeline.BuildPlayer</c> off the main thread).
    ///
    /// <para><b>How "async" works.</b> <see cref="Start"/> registers a Running job and schedules
    /// the (synchronous, main-thread, multi-minute) <c>BuildPipeline.BuildPlayer</c> call onto a
    /// later <c>EditorApplication.delayCall</c> tick, then returns the handle. The
    /// <c>build_player</c> dispatcher work item therefore returns in milliseconds — the MCP wire
    /// call never holds open across the build, so the 5-minute no-response abort cannot fire. The
    /// Editor main thread still freezes for the duration of the actual build (unavoidable —
    /// <c>BuildPlayer</c> is synchronous main-thread by necessity); <c>build_status</c> polls this
    /// registry to observe completion.</para>
    ///
    /// <para><b>Lifetime.</b> In-memory only; cleared on domain reload. Keeps the running jobs plus
    /// the last <see cref="MaxCompleted"/> completed jobs (FIFO eviction). A poll for an
    /// evicted/unknown handle is an InvalidInput on the tool side.</para>
    /// </summary>
    internal static class BuildJobRegistry
    {
        /// <summary>How many completed jobs stay queryable before FIFO eviction.</summary>
        public const int MaxCompleted = 8;

        /// <summary>
        /// Cap on concurrently-running jobs. Completed jobs are FIFO-evicted, but a build
        /// interrupted by a domain reload never reaches <see cref="MarkCompleted"/> (delayCall
        /// delegates are cleared on reload), so its job sticks at Running. Without this cap,
        /// repeated build_player calls that never poll to completion would accumulate stranded
        /// Running entries unbounded. A real machine never runs this many builds at once.
        /// </summary>
        public const int MaxRunning = 4;

        private static readonly Dictionary<string, BuildJob> _jobs = new Dictionary<string, BuildJob>(StringComparer.Ordinal);
        // Completion order, oldest first — drives FIFO eviction of finished jobs.
        private static readonly Queue<string> _completedOrder = new Queue<string>();
        private static int _counter;

        /// <summary>
        /// Register a Running job for <paramref name="options"/>, schedule the build onto a later
        /// main-thread tick, and return the opaque handle. Returns fast — does not block on the
        /// build. The scheduled callback runs <c>BuildPipeline.BuildPlayer</c> on the main thread,
        /// maps the report into the job summary, and flips the status; any exception is caught and
        /// recorded as Failed (never escapes as a raw exception).
        /// </summary>
        public static string Start(BuildPlayerOptions options)
        {
            int running = 0;
            foreach (var entry in _jobs.Values)
            {
                if (entry.Status == BuildStatus.Running) running++;
            }
            if (running >= MaxRunning)
                throw new ToolException("ToolError",
                    $"too many builds in flight ({running}/{MaxRunning} running) — poll build_status to drain, or wait for an in-flight build to finish. (Stranded Running jobs from a domain reload mid-build also count; restart the Editor to clear them.)");

            _counter++;
            var handle = $"build-{_counter}";
            var job = new BuildJob(handle, options);
            _jobs[handle] = job;

            // Defer the blocking BuildPlayer call to a later main-thread tick so the caller's
            // dispatcher work item returns now. delayCall fires once on the next editor update.
            EditorApplication.delayCall += () => RunBuild(job);

            return handle;
        }

        /// <summary>The job for <paramref name="handle"/>, or null if unknown/evicted.</summary>
        public static BuildJob Get(string handle)
        {
            if (string.IsNullOrEmpty(handle)) return null;
            return _jobs.TryGetValue(handle, out var job) ? job : null;
        }

        private static void RunBuild(BuildJob job)
        {
            var startedTicks = DateTime.UtcNow;
            try
            {
                BuildReport report = BuildPipeline.BuildPlayer(job.Options);
                job.Summary = MapSummary(report, (DateTime.UtcNow - startedTicks));
                job.Status = report.summary.result == BuildResult.Succeeded
                    ? BuildStatus.Succeeded
                    : BuildStatus.Failed;
            }
            catch (Exception ex)
            {
                // A thrown build (e.g. invalid options) is a failed build, not a crash. Record it
                // structurally so build_status reports a clean { status:"failed" } envelope rather
                // than the dispatcher surfacing a raw ToolError. Log too — no silent swallow.
                Debug.LogError($"[UnityMCP] build {job.Handle} threw: {ex.Message}");
                job.Summary = new JObject
                {
                    ["result"] = "Failed",
                    ["totalErrors"] = 1,
                    ["errors"] = new JArray { ex.Message },
                    ["outputPath"] = job.Options.locationPathName ?? string.Empty,
                    ["totalSizeBytes"] = 0L,
                    ["durationMs"] = (int)(DateTime.UtcNow - startedTicks).TotalMilliseconds,
                };
                job.Status = BuildStatus.Failed;
            }
            finally
            {
                MarkCompleted(job.Handle);
            }
        }

        private static JObject MapSummary(BuildReport report, TimeSpan duration)
        {
            var summary = report.summary;

            // Collect error/exception build messages across all steps — these are what a broken
            // build needs to surface (criterion 1), not just the totalErrors count.
            var errors = new JArray();
            foreach (var step in report.steps)
            {
                foreach (var msg in step.messages)
                {
                    if (msg.type == LogType.Error || msg.type == LogType.Exception)
                        errors.Add(msg.content);
                }
            }

            return new JObject
            {
                ["result"] = summary.result.ToString(),
                ["totalErrors"] = (int)summary.totalErrors,
                ["errors"] = errors,
                ["outputPath"] = summary.outputPath ?? string.Empty,
                ["totalSizeBytes"] = (long)summary.totalSize,
                ["durationMs"] = (int)duration.TotalMilliseconds,
            };
        }

        private static void MarkCompleted(string handle)
        {
            _completedOrder.Enqueue(handle);
            while (_completedOrder.Count > MaxCompleted)
            {
                var evicted = _completedOrder.Dequeue();
                _jobs.Remove(evicted);
            }
        }
    }
}
