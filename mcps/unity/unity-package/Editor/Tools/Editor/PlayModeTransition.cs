using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Single owner of Play Mode transition mechanics — compile-wait pre-flight, dirty-scene
    /// auto-save, the isPlaying/isPaused flips, and the yield-poll bounded await. Both
    /// <see cref="PlaymodeSetTool"/> (which exposes the full three-state surface) and
    /// vision tools that need "be in play before I capture" call into here so the modal-save
    /// and compile-wait subtleties live in exactly one place.
    ///
    /// The yield-poll uses <c>await Task.Yield()</c>, which returns control to the
    /// MainThreadDispatcher's update loop — the same loop Unity drives the
    /// playModeStateChanged tick on. Blocking (Thread.Sleep) here would deadlock.
    /// </summary>
    internal static class PlayModeTransition
    {
        public const int DefaultTimeoutMs = 10_000;
        public const int MinTimeoutMs = 1_000;
        public const int MaxTimeoutMs = 60_000;

        public static int ClampTimeout(int timeoutMs)
        {
            if (timeoutMs < MinTimeoutMs) return MinTimeoutMs;
            if (timeoutMs > MaxTimeoutMs) return MaxTimeoutMs;
            return timeoutMs;
        }

        /// <summary>"stopped" | "paused" | "play" — the live Editor state.</summary>
        public static string Observe()
        {
            if (!EditorApplication.isPlaying) return "stopped";
            return EditorApplication.isPaused ? "paused" : "play";
        }

        /// <summary>
        /// Block (via yield-poll) until the Editor is out of compile/update churn. Flipping
        /// Play Mode mid-reload produces unreliable transitions and may drop the
        /// playModeStateChanged tick. Mirrors RunTestsTool's pre-flight.
        /// </summary>
        public static async Task WaitForStableEditor(int compileTimeoutMs)
        {
            var t0 = DateTime.UtcNow;
            while (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                if ((DateTime.UtcNow - t0).TotalMilliseconds > compileTimeoutMs)
                {
                    throw new ToolException("ToolError",
                        $"Editor still compiling/updating after {compileTimeoutMs} ms — refusing to flip Play Mode in an unstable state.");
                }
                await Task.Yield();
            }
        }

        /// <summary>
        /// Transition the Editor to <paramref name="target"/> ("play" | "paused" | "stopped")
        /// and bounded-await until it settles. Idempotent: requesting the current state is a
        /// no-op that returns within a frame with transitionMs 0. Auto-saves dirty scenes when
        /// entering Play Mode from stopped (Unity otherwise blocks on a modal save dialog).
        /// Returns { previous, current, transitionMs }. Throws ToolException("TransitionTimeout",
        /// Details: { requestedState, observedState, elapsedMs }) on timeout.
        /// </summary>
        public static async Task<JObject> TransitionTo(string target, int timeoutMs, bool saveDirtyScenes)
        {
            timeoutMs = ClampTimeout(timeoutMs);

            var compileTimeoutMs = Math.Min(MaxTimeoutMs, timeoutMs / 2);
            await WaitForStableEditor(compileTimeoutMs);

            var previous = Observe();
            if (previous == target)
            {
                return new JObject
                {
                    ["previous"] = previous,
                    ["current"] = previous,
                    ["transitionMs"] = 0,
                };
            }

            // Auto-save only when entering Play Mode from stopped — that's the only
            // transition that touches scene load order and risks the save-modal hang.
            bool enteringPlayFromStopped = previous == "stopped" && (target == "play" || target == "paused");
            if (enteringPlayFromStopped && saveDirtyScenes)
            {
                try { EditorSceneManager.SaveOpenScenes(); }
                catch (Exception ex)
                {
                    throw new ToolException("ToolError",
                        $"Failed to save open scenes before entering Play Mode: {ex.Message}");
                }
            }

            var t0 = DateTime.UtcNow;
            ApplyTransition(previous, target);

            while (Observe() != target)
            {
                if ((DateTime.UtcNow - t0).TotalMilliseconds > timeoutMs)
                {
                    var elapsedMs = (int)(DateTime.UtcNow - t0).TotalMilliseconds;
                    throw new ToolException(
                        "TransitionTimeout",
                        "Play Mode transition did not settle within the timeout.",
                        new JObject
                        {
                            ["requestedState"] = target,
                            ["observedState"] = Observe(),
                            ["elapsedMs"] = elapsedMs,
                        });
                }
                await Task.Yield();
            }

            return new JObject
            {
                ["previous"] = previous,
                ["current"] = Observe(),
                ["transitionMs"] = (int)(DateTime.UtcNow - t0).TotalMilliseconds,
            };
        }

        private static void ApplyTransition(string previous, string target)
        {
            switch (target)
            {
                case "play":
                    if (previous == "paused")
                        EditorApplication.isPaused = false;
                    else
                        EditorApplication.isPlaying = true;
                    break;

                case "paused":
                    if (previous == "stopped")
                    {
                        // Set isPaused first so Unity enters play already paused —
                        // avoids a brief running frame.
                        EditorApplication.isPaused = true;
                        EditorApplication.isPlaying = true;
                    }
                    else // previous == "play"
                    {
                        EditorApplication.isPaused = true;
                    }
                    break;

                case "stopped":
                    EditorApplication.isPlaying = false;
                    break;
            }
        }
    }
}
