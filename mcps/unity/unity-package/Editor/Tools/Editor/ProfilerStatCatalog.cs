using System.Collections.Generic;
using Unity.Profiling;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// The fixed set of built-in profiler stats <see cref="ProfilerCaptureTool"/> samples, mapping
    /// each spec stat to its <see cref="ProfilerCategory"/> + counter-name string.
    ///
    /// <para><b>Stat names (Unity 6 / 6000.3).</b> The counter-name strings below are the verbatim
    /// built-in names from the Unity 6000.3 "Profiler counters reference" (Rendering + Memory
    /// tables) and the ProfilerRecorder ScriptReference example. Counter names shift across Unity
    /// versions, so <see cref="VerifyAvailable"/> remains the live guard: called in a windowed
    /// Unity 6 Editor, it returns the names whose <see cref="ProfilerRecorder"/> does NOT
    /// resolve (Valid == false), so any drift can be corrected here. A stat whose recorder is
    /// invalid samples nothing
    /// — the capture omits it rather than reporting garbage (criterion 3).</para>
    ///
    /// <para><b>Residual uncertainty.</b> Render counters' ProfilerCategory is Render per the API,
    /// but the reference page printed names without enum values — confirm via VerifyAvailable.
    /// "GC Allocated In Frame" was not on the counters-reference page (it is the established
    /// Memory-category per-frame allocation counter); VerifyAvailable will flag it if drifted.</para>
    ///
    /// <para><b>Version floor (KNOWN GAP).</b> These names are pinned to Unity 6 (6000.3). The
    /// ProfilerRecorder API surface itself (StartNew / Valid / LastValue / Dispose) is identical
    /// back to the 2021.3 LTS floor, so this code COMPILES and RUNS pre-6 — but some counter NAMES
    /// differ on older versions (e.g. the render-thread counter is "Render Thread" pre-6, renamed
    /// to "CPU Render Thread Frame Time" in 6.x; the 2021.3 counters-reference manual page does not
    /// exist, so older names could not be doc-verified). On a pre-6 Editor a renamed counter
    /// resolves invalid and is simply OMITTED from the capture — correct, not garbage, but missing.
    /// Per-version fallback was deliberately NOT built (the spec targets 6.x; 2021.3 is a stated
    /// floor, not a tested target). To support an older Editor: run <see cref="VerifyAvailable"/>
    /// there, then add that version's names here. The omission is the safe failure mode.</para>
    ///
    /// Sources: docs.unity3d.com/6000.3 — ProfilerRecorder ScriptReference + Manual/
    /// profiler-counters-reference.html (fetched at execute time).
    /// </summary>
    internal static class ProfilerStatCatalog
    {
        internal readonly struct Stat
        {
            /// <summary>Result key in the capture output (e.g. "mainThreadTimeNs").</summary>
            public readonly string Key;
            public readonly ProfilerCategory Category;
            /// <summary>The built-in counter name passed to ProfilerRecorder.StartNew.</summary>
            public readonly string CounterName;
            /// <summary>Unit hint for the consumer (time stats are nanoseconds; counts are unitless).</summary>
            public readonly string Unit;

            public Stat(string key, ProfilerCategory category, string counterName, string unit)
            {
                Key = key;
                Category = category;
                CounterName = counterName;
                Unit = unit;
            }
        }

        /// <summary>
        /// Per-frame stats sampled over the capture window. Time counters report nanoseconds
        /// (ProfilerRecorder's native unit for time markers); counts are unitless.
        /// </summary>
        public static readonly Stat[] FrameStats =
        {
            new Stat("mainThreadTimeNs",   ProfilerCategory.Internal, "Main Thread",                 "ns"),
            new Stat("renderThreadTimeNs", ProfilerCategory.Render,   "CPU Render Thread Frame Time", "ns"),
            new Stat("gcAllocatedInFrame", ProfilerCategory.Memory,   "GC Allocated In Frame",       "bytes"),
            new Stat("drawCalls",          ProfilerCategory.Render,   "Draw Calls Count",            "count"),
            new Stat("batches",            ProfilerCategory.Render,   "Batches Count",               "count"),
            new Stat("setPassCalls",       ProfilerCategory.Render,   "SetPass Calls Count",         "count"),
            new Stat("triangles",          ProfilerCategory.Render,   "Triangles Count",             "count"),
            new Stat("vertices",           ProfilerCategory.Render,   "Vertices Count",              "count"),
        };

        /// <summary>
        /// Memory counters read once at capture end for the snapshot (total reserved, mono used +
        /// heap, gfx). These are gauges, not per-frame samples.
        /// </summary>
        public static readonly Stat[] MemoryStats =
        {
            new Stat("totalReserved", ProfilerCategory.Memory, "Total Reserved Memory", "bytes"),
            new Stat("monoUsed",      ProfilerCategory.Memory, "GC Used Memory",        "bytes"),
            new Stat("monoHeap",      ProfilerCategory.Memory, "GC Reserved Memory",    "bytes"),
            new Stat("gfx",           ProfilerCategory.Memory, "Gfx Used Memory",       "bytes"),
        };

        /// <summary>
        /// Returns the counter names (frame + memory) whose ProfilerRecorder does NOT resolve
        /// (Valid == false) on the running Editor — i.e. names that drifted and need correcting.
        /// An empty list means every name is valid on this Unity version. Call from a windowed
        /// Unity 6 Editor (the live-verification deliverable of the [research] step).
        /// </summary>
        public static List<string> VerifyAvailable()
        {
            var missing = new List<string>();
            foreach (var stat in FrameStats) AddIfMissing(stat, missing);
            foreach (var stat in MemoryStats) AddIfMissing(stat, missing);
            return missing;
        }

        private static void AddIfMissing(Stat stat, List<string> missing)
        {
            // Probe availability by momentarily starting a recorder and checking Valid — this is
            // the supported way to test a counter name on the running Editor (there is no
            // ProfilerRecorderHandle.Get(category, name) overload). Dispose immediately.
            using (var recorder = ProfilerRecorder.StartNew(stat.Category, stat.CounterName))
            {
                if (!recorder.Valid)
                    missing.Add($"{stat.Category}/{stat.CounterName}");
            }
        }
    }
}
