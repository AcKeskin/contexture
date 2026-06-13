#if UNITY_MCP_HAS_TEST_FRAMEWORK
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.TestTools.TestRunner.Api;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Tests
{
    /// <summary>
    /// Runs Unity Test Framework tests programmatically and returns structured
    /// results. Wraps <c>TestRunnerApi.Execute</c> with a callback adapter that
    /// captures per-test outcomes into a JSON tree.
    ///
    /// EditMode tests run in the Editor's main domain — fast, no scene swap.
    /// PlayMode tests enter play mode, which is intrinsically slow and
    /// disruptive (Unity unloads the open scene); smoke skips PlayMode by
    /// default.
    ///
    /// The TestRunnerApi is asynchronous: Execute() returns a job GUID and
    /// fires callbacks. The tool registers a callback adapter, calls Execute,
    /// then blocks the calling thread on a poll loop until RunFinished fires
    /// (or the timeout expires). Bounded: defaults to 5 minutes; max 30.
    /// </summary>
    [UnityMcpTool("run_tests", Requires = new[] { CapabilityKey.TestFramework })]
    internal sealed class RunTestsTool : IUnityMcpTool
    {
        private const int DefaultTimeoutMs = 300_000;
        private const int MaxTimeoutMs = 1_800_000;

        public string Name => "run_tests";

        public string Description =>
            "Run Unity Test Framework tests and return structured results. " +
            "Required: 'mode' = 'EditMode' | 'PlayMode'. Optional filters: " +
            "'assemblyNames' (string[]), 'categoryNames' (string[]), 'testNames' " +
            "(string[] of full FixtureName.TestName paths), 'groupNames' (regex " +
            "patterns matched against fully-qualified test names). Optional " +
            "'timeoutMs' (default 300000, max 1800000). Optional 'saveDirtyScenes' " +
            "(default true) auto-saves any modified scenes before launching the " +
            "test run — Unity otherwise blocks on a modal save dialog and the " +
            "call hangs. Returns { mode, passed, failed, skipped, inconclusive, " +
            "durationSeconds, results: [{ fullName, status, durationSeconds, " +
            "message?, stackTrace? }] }. An empty result set (no matching " +
            "tests) is not an error.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "EditMode", "PlayMode" },
                },
                ["assemblyNames"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["categoryNames"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["testNames"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["groupNames"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["timeoutMs"] = new JObject
                {
                    ["type"] = "integer", ["minimum"] = 1000, ["maximum"] = MaxTimeoutMs, ["default"] = DefaultTimeoutMs,
                },
                ["saveDirtyScenes"] = new JObject { ["type"] = "boolean", ["default"] = true },
            },
            ["required"] = new JArray { "mode" },
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var mode = @params.Value<string>("mode");
            if (string.IsNullOrEmpty(mode))
                throw new ToolException("InvalidInput", "'mode' is required.");
            if (mode != "EditMode" && mode != "PlayMode")
                throw new ToolException("InvalidInput", $"mode must be EditMode or PlayMode; got '{mode}'.");

            int timeoutMs = @params.Value<int?>("timeoutMs") ?? DefaultTimeoutMs;
            if (timeoutMs < 1000) timeoutMs = 1000;
            if (timeoutMs > MaxTimeoutMs) timeoutMs = MaxTimeoutMs;

            var filter = new Filter
            {
                testMode = mode == "EditMode" ? TestMode.EditMode : TestMode.PlayMode,
                assemblyNames = ToStringArray(@params["assemblyNames"]),
                categoryNames = ToStringArray(@params["categoryNames"]),
                testNames = ToStringArray(@params["testNames"]),
                groupNames = ToStringArray(@params["groupNames"]),
            };

            // Wait for any in-flight compile to settle. Running tests while
            // Unity is recompiling makes TestRunnerApi callbacks unreliable —
            // RunFinished may never fire because the test runner is itself
            // suspended waiting on the assembly reload. Bound this wait by
            // a fraction of the overall timeout so it can't burn it all.
            var compileTimeoutMs = Math.Min(60_000, timeoutMs / 2);
            var compileT0 = DateTime.UtcNow;
            while (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                if ((DateTime.UtcNow - compileT0).TotalMilliseconds > compileTimeoutMs)
                {
                    throw new ToolException("ToolError",
                        $"Editor still compiling/updating after {compileTimeoutMs} ms — refusing to run tests in an unstable state.");
                }
                await Task.Yield();
            }

            // Save dirty scenes before launching tests. TestRunnerApi.Execute
            // pops a modal "Save Scene?" dialog when any open scene has unsaved
            // changes — the modal blocks the Editor's main thread and the test
            // run never starts. Captured as the
            // `unity-test-runner-saves-scene-modal` lesson; default behavior
            // is to auto-save. Caller can opt out via saveDirtyScenes:false
            // for the rare case the test scenario depends on the dirty state.
            bool saveDirtyScenes = @params.Value<bool?>("saveDirtyScenes") ?? true;
            if (saveDirtyScenes)
            {
                try { EditorSceneManager.SaveOpenScenes(); }
                catch (Exception ex)
                {
                    throw new ToolException("ToolError",
                        $"Failed to save open scenes before running tests: {ex.Message}");
                }
            }

            var settings = new ExecutionSettings(filter);
            var api = ScriptableObject.CreateInstance<TestRunnerApi>();
            var collector = new TestResultCollector();
            api.RegisterCallbacks(collector);

            try
            {
                api.Execute(settings);

                // Yield-based wait: TestRunnerApi callbacks fire on the main thread,
                // which is also the thread this method runs on. Blocking with
                // Thread.Sleep would deadlock — Unity's EditorApplication.update
                // would never get a chance to fire RunFinished. await Task.Yield()
                // returns control to the dispatcher's update loop between polls.
                var t0 = DateTime.UtcNow;
                while (!collector.IsFinished)
                {
                    if ((DateTime.UtcNow - t0).TotalMilliseconds > timeoutMs)
                    {
                        throw new ToolException("ToolError",
                            $"Test run did not complete within {timeoutMs} ms. " +
                            "Increase 'timeoutMs' or narrow the filter.");
                    }
                    await Task.Yield();
                }

                return ToolResult.Json(collector.Build(mode));
            }
            finally
            {
                api.UnregisterCallbacks(collector);
                ScriptableObject.DestroyImmediate(api);
            }
        }

        private static string[] ToStringArray(JToken token)
        {
            if (token is JArray arr && arr.Count > 0)
            {
                var s = new string[arr.Count];
                for (int i = 0; i < arr.Count; i++) s[i] = arr[i].Value<string>();
                return s;
            }
            return null;
        }

        private sealed class TestResultCollector : ICallbacks
        {
            private readonly List<JObject> _results = new();
            private double _runDurationSeconds;
            public bool IsFinished { get; private set; }

            public void RunStarted(ITestAdaptor testsToRun) { }

            public void RunFinished(ITestResultAdaptor result)
            {
                _runDurationSeconds = result?.Duration ?? 0;
                IsFinished = true;
            }

            public void TestStarted(ITestAdaptor test) { }

            public void TestFinished(ITestResultAdaptor result)
            {
                // Skip suite-level rollups — only leaf tests carry useful results.
                // Suites have IsSuite=true and their results are the aggregate of
                // children. Reporting them double-counts the overall pass/fail.
                if (result.Test != null && result.Test.IsSuite) return;

                var entry = new JObject
                {
                    ["fullName"] = result.Test?.FullName ?? string.Empty,
                    ["status"] = result.TestStatus.ToString(),
                    ["durationSeconds"] = result.Duration,
                };
                if (!string.IsNullOrEmpty(result.Message)) entry["message"] = result.Message;
                if (!string.IsNullOrEmpty(result.StackTrace)) entry["stackTrace"] = result.StackTrace;
                _results.Add(entry);
            }

            public JObject Build(string mode)
            {
                int passed = 0, failed = 0, skipped = 0, inconclusive = 0;
                var arr = new JArray();
                foreach (var r in _results)
                {
                    switch (r["status"]?.Value<string>())
                    {
                        case "Passed": passed++; break;
                        case "Failed": failed++; break;
                        case "Skipped": skipped++; break;
                        case "Inconclusive": inconclusive++; break;
                    }
                    arr.Add(r);
                }
                return new JObject
                {
                    ["mode"] = mode,
                    ["passed"] = passed,
                    ["failed"] = failed,
                    ["skipped"] = skipped,
                    ["inconclusive"] = inconclusive,
                    ["durationSeconds"] = _runDurationSeconds,
                    ["count"] = _results.Count,
                    ["results"] = arr,
                };
            }
        }
    }
}
#endif
