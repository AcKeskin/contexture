using System;
using System.Diagnostics;
using Debug = UnityEngine.Debug;

namespace UnityMcp.Editor.Bridge
{
    /// <summary>
    /// Structured per-tool-invocation log lines. Pairs with the server-side
    /// invocation-log so every tool call produces matching `[UnityMCP] &lt;id&gt; &lt;tool&gt;`
    /// entries on both halves of the bridge — searchable by correlation ID end-to-end.
    ///
    /// Verbosity controlled by the <c>UNITY_MCP_LOG_LEVEL</c> env var:
    ///   - unset / "all"          → emit start + ok/err (default)
    ///   - "errors-only" / "err"  → emit err only
    /// </summary>
    internal static class InvocationLog
    {
        private const string EnvVar = "UNITY_MCP_LOG_LEVEL";
        private const string Prefix = "[UnityMCP]";

        public static Stopwatch Start(string correlationId, string tool)
        {
            if (!ErrorsOnly())
            {
                Debug.Log($"{Prefix} {Trim(correlationId)} {tool} start");
            }
            return Stopwatch.StartNew();
        }

        public static void Ok(string correlationId, string tool, Stopwatch sw)
        {
            if (ErrorsOnly()) return;
            sw?.Stop();
            long ms = sw?.ElapsedMilliseconds ?? -1;
            Debug.Log($"{Prefix} {Trim(correlationId)} {tool} ok {ms}ms");
        }

        public static void Err(string correlationId, string tool, Stopwatch sw, string code, string message)
        {
            sw?.Stop();
            long ms = sw?.ElapsedMilliseconds ?? -1;
            // Errors always emit, regardless of verbosity. First line of the message only —
            // multi-line stacks pollute the structured-log shape.
            string firstLine = FirstLine(message);
            Debug.Log($"{Prefix} {Trim(correlationId)} {tool} err {code} {ms}ms {firstLine}");
        }

        private static bool ErrorsOnly()
        {
            try
            {
                var v = Environment.GetEnvironmentVariable(EnvVar);
                return v != null && (v.Equals("errors-only", StringComparison.OrdinalIgnoreCase)
                                  || v.Equals("err", StringComparison.OrdinalIgnoreCase));
            }
            catch
            {
                return false;
            }
        }

        private static string Trim(string correlationId)
        {
            if (string.IsNullOrEmpty(correlationId)) return "(no-id)";
            // Full UUIDs are noisy in the console; first 8 chars stay greppable.
            return correlationId.Length > 8 ? correlationId.Substring(0, 8) : correlationId;
        }

        private static string FirstLine(string message)
        {
            if (string.IsNullOrEmpty(message)) return string.Empty;
            int nl = message.IndexOfAny(new[] { '\n', '\r' });
            return nl >= 0 ? message.Substring(0, nl) : message;
        }
    }
}
