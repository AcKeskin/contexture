using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Console;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Reads recent log events captured via Application.logMessageReceivedThreaded since the
    /// MCP package booted. Filterable by severity. Limited to the in-memory ring buffer
    /// (1000 entries — see ConsoleLogBuffer); v2 will add LogEntries reflection for parity
    /// with the Unity console window (compile errors, package manager messages).
    /// </summary>
    [UnityMcpTool("console_read")]
    internal sealed class ConsoleReadTool : IUnityMcpTool
    {
        public string Name => "console_read";

        public string Description =>
            "Returns recent runtime/editor log events captured since the MCP package booted. " +
            "Filter by severity ('error','warning','log','assert','exception'); 'all' returns " +
            "everything. Optional 'clear' wipes the buffer (does not affect Unity's console window).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["severities"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "string",
                        ["enum"] = new JArray { "error", "warning", "log", "assert", "exception", "all" },
                    },
                    ["default"] = new JArray { "error", "warning" },
                    ["description"] = "Severities to include. 'all' expands to every kind.",
                },
                ["limit"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 1,
                    ["maximum"] = 1000,
                    ["default"] = 100,
                    ["description"] = "Maximum entries to return (most recent).",
                },
                ["includeStackTrace"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = false,
                },
                ["clear"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = false,
                    ["description"] = "If true, wipes the in-memory buffer after reading.",
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var severities = ParseSeverities(@params["severities"] as JArray);
            int limit = @params["limit"]?.Value<int>() ?? 100;
            if (limit < 1) limit = 1;
            if (limit > 1000) limit = 1000;
            bool includeStack = @params["includeStackTrace"]?.Value<bool>() ?? false;
            bool clear = @params["clear"]?.Value<bool>() ?? false;

            // Snapshot more than we need so post-filtering still satisfies 'limit' for picky filters.
            var raw = ConsoleLogBuffer.Snapshot(1000);
            var items = new JArray();
            int kept = 0;
            for (int i = raw.Count - 1; i >= 0 && kept < limit; i--)
            {
                var e = raw[i];
                if (!severities.Contains(e.Type)) continue;
                var entry = new JObject
                {
                    ["timestamp"] = e.TimestampUtc.ToString("o"),
                    ["type"] = e.Type.ToString(),
                    ["message"] = e.Message,
                };
                if (includeStack && !string.IsNullOrEmpty(e.StackTrace))
                {
                    entry["stackTrace"] = e.StackTrace;
                }
                items.Add(entry);
                kept++;
            }

            // Items were collected newest-first; reverse for chronological order.
            var ordered = new JArray();
            for (int i = items.Count - 1; i >= 0; i--) ordered.Add(items[i]);

            if (clear) ConsoleLogBuffer.Clear();

            var data = new JObject
            {
                ["count"] = ordered.Count,
                ["bufferTotal"] = raw.Count,
                ["truncated"] = raw.Count > 1000, // 1000 is the buffer cap; surface for honesty.
                ["cleared"] = clear,
                ["items"] = ordered,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static HashSet<LogType> ParseSeverities(JArray arr)
        {
            var set = new HashSet<LogType>();
            if (arr == null || arr.Count == 0)
            {
                set.Add(LogType.Error);
                set.Add(LogType.Warning);
                set.Add(LogType.Exception);
                return set;
            }

            foreach (var t in arr)
            {
                var s = (t.ToString() ?? string.Empty).ToLowerInvariant();
                switch (s)
                {
                    case "error": set.Add(LogType.Error); break;
                    case "warning": set.Add(LogType.Warning); break;
                    case "log": set.Add(LogType.Log); break;
                    case "assert": set.Add(LogType.Assert); break;
                    case "exception": set.Add(LogType.Exception); break;
                    case "all":
                        set.Add(LogType.Error);
                        set.Add(LogType.Warning);
                        set.Add(LogType.Log);
                        set.Add(LogType.Assert);
                        set.Add(LogType.Exception);
                        break;
                    default:
                        throw new ArgumentException($"Unknown severity '{s}'.");
                }
            }
            return set;
        }
    }
}
