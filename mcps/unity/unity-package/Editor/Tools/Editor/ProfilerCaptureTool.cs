using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Unity.Profiling;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Captures per-frame performance stats over N play-mode frames plus an end-of-capture memory
    /// snapshot. Requires play mode (most stats are 0/meaningless when stopped). Synchronous
    /// bounded-await: samples frame-by-frame via the same yield-poll as
    /// <see cref="PlayModeTransition"/> (<c>await Task.Yield()</c> returns control to the
    /// dispatcher's update loop — Thread.Sleep would deadlock it), then returns.
    ///
    /// Stat names come from <see cref="ProfilerStatCatalog"/> (live-verifiable). A stat whose
    /// recorder is invalid on this Unity version is omitted from the result rather than reported as
    /// garbage. Every <see cref="ProfilerRecorder"/> is disposed in a finally (csharp/disposal).
    /// </summary>
    [UnityMcpTool("profiler_capture")]
    internal sealed class ProfilerCaptureTool : IUnityMcpTool
    {
        private const int DefaultFrameCount = 60;
        private const int MinFrameCount = 1;
        private const int MaxFrameCount = 600;
        // Guard against a stalled play-mode loop never advancing frames — cap the wall-clock wait.
        private const int CaptureTimeoutMs = 60_000;

        public string Name => "profiler_capture";

        public string Description =>
            "Capture per-frame performance stats over N play-mode frames + an end-of-capture " +
            "memory snapshot. Requires PLAY MODE (throws ToolException('InvalidInput') when " +
            "stopped). Optional 'frameCount' (default 60, min 1, max 600). Returns { frameCount, " +
            "samples: { <stat>: [perFrame...] }, aggregates: { <stat>: { min, max, avg } }, " +
            "memory: { totalReserved, monoUsed, monoHeap, gfx } }. Stats: main-thread time, " +
            "render-thread time, GC allocated-in-frame, draw calls, batches (SetPass), triangles, " +
            "vertices (time stats in nanoseconds). Synchronous (bounded-await, seconds).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["frameCount"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = MinFrameCount,
                    ["maximum"] = MaxFrameCount,
                    ["default"] = DefaultFrameCount,
                },
            },
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!EditorApplication.isPlaying)
                throw new ToolException("InvalidInput",
                    "profiler_capture requires play mode — enter play (playmode_set 'play') before capturing.");

            int frameCount = @params.Value<int?>("frameCount") ?? DefaultFrameCount;
            if (frameCount < MinFrameCount) frameCount = MinFrameCount;
            if (frameCount > MaxFrameCount) frameCount = MaxFrameCount;

            // Start a recorder per resolvable frame stat with capacity = frameCount, so the
            // recorder retains the last N frames in its ring buffer for a single CopyTo at the end.
            // Skip stats whose recorder is invalid on this Unity version.
            var recorders = new List<(ProfilerStatCatalog.Stat stat, ProfilerRecorder recorder)>();
            try
            {
                foreach (var stat in ProfilerStatCatalog.FrameStats)
                {
                    var recorder = ProfilerRecorder.StartNew(stat.Category, stat.CounterName, frameCount);
                    if (recorder.Valid)
                        recorders.Add((stat, recorder));
                    else
                        recorder.Dispose();
                }

                // Let N frames elapse so each recorder fills its ring buffer. EditorApplication.update
                // ticks once per editor frame and drives the dispatcher's Drain; awaiting Task.Yield
                // returns control to that loop so a frame can pass (Thread.Sleep would deadlock it).
                var t0 = DateTime.UtcNow;
                for (int frame = 0; frame < frameCount; frame++)
                {
                    await Task.Yield();
                    if ((DateTime.UtcNow - t0).TotalMilliseconds > CaptureTimeoutMs)
                        throw new ToolException("ToolError",
                            $"profiler_capture did not collect {frameCount} frames within {CaptureTimeoutMs} ms — is the play-mode loop advancing? (paused play mode does not advance frames; use playmode_step instead.)");
                }

                // Bulk-extract the buffered samples per recorder (CopyTo is the API's intended read),
                // then fold each window into per-frame values + min/max/avg.
                var samplesJson = new JObject();
                var aggregatesJson = new JObject();
                foreach (var (stat, recorder) in recorders)
                {
                    var (perFrame, aggregate) = ExtractWindow(recorder);
                    samplesJson[stat.Key] = perFrame;
                    aggregatesJson[stat.Key] = aggregate;
                }

                var memory = ReadMemorySnapshot();

                return ToolResult.Json(new JObject
                {
                    ["frameCount"] = frameCount,
                    ["samples"] = samplesJson,
                    ["aggregates"] = aggregatesJson,
                    ["memory"] = memory,
                });
            }
            finally
            {
                // Dispose every recorder — ProfilerRecorder owns a native handle (csharp/disposal).
                foreach (var (_, recorder) in recorders)
                    recorder.Dispose();
            }
        }

        /// <summary>
        /// Bulk-read a recorder's buffered samples via CopyTo and fold them into a (per-frame array,
        /// { min, max, avg }) pair. An empty window yields an empty array and zeroed aggregates.
        /// </summary>
        private static (JArray perFrame, JObject aggregate) ExtractWindow(ProfilerRecorder recorder)
        {
            int count = recorder.Count;
            var perFrame = new JArray();
            if (count == 0)
            {
                return (perFrame, new JObject { ["min"] = 0, ["max"] = 0, ["avg"] = 0 });
            }

            var window = new List<ProfilerRecorderSample>(count);
            recorder.CopyTo(window);
            if (window.Count == 0)
            {
                return (perFrame, new JObject { ["min"] = 0, ["max"] = 0, ["avg"] = 0 });
            }

            double min = double.MaxValue, max = double.MinValue, sum = 0;
            foreach (var sample in window)
            {
                double v = sample.Value;
                perFrame.Add(v);
                if (v < min) min = v;
                if (v > max) max = v;
                sum += v;
            }

            return (perFrame, new JObject
            {
                ["min"] = min,
                ["max"] = max,
                ["avg"] = sum / window.Count,
            });
        }

        /// <summary>
        /// Read the memory gauges once for the end-of-capture snapshot. Each counter is read via a
        /// momentary recorder; an unresolvable counter is reported as 0 (omission-safe).
        /// </summary>
        private static JObject ReadMemorySnapshot()
        {
            var memory = new JObject();
            foreach (var stat in ProfilerStatCatalog.MemoryStats)
            {
                long value = 0;
                using (var recorder = ProfilerRecorder.StartNew(stat.Category, stat.CounterName))
                {
                    if (recorder.Valid)
                        value = recorder.LastValue;
                }
                memory[stat.Key] = value;
            }
            return memory;
        }
    }
}
