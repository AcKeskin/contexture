using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Scripts
{
    /// <summary>
    /// Text search inside one file or under a project-relative directory glob.
    /// Returns matches with file path, 1-based line number, the matched line,
    /// and an optional surrounding context window. Read-only — no writes.
    ///
    /// Pattern is interpreted as a regex by default; pass `literal: true` to
    /// match the pattern as a literal string instead. Defaults: case-sensitive,
    /// 0 context lines (just the matching line), 200 max results, search any
    /// in-project path.
    /// </summary>
    [UnityMcpTool("find_in_file")]
    internal sealed class FindInFileTool : IUnityMcpTool
    {
        public string Name => "find_in_file";

        public string Description =>
            "Text search inside one file or recursively under a directory. Required: " +
            "'pattern' (regex by default; pass 'literal:true' to match as a literal string) " +
            "and 'path' (project-relative file or directory). Optional: 'caseSensitive' " +
            "(default true), 'context' (lines of surrounding context per match, default 0), " +
            "'maxResults' (default 200), 'extensions' (filter inside a directory; default " +
            "['.cs','.uxml','.uss','.asmdef','.shader','.cginc','.hlsl']). Returns " +
            "{ count, truncated, matches: [{ path, line, text, context: [...] }] }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["pattern"] = new JObject { ["type"] = "string" },
                ["path"] = new JObject { ["type"] = "string" },
                ["literal"] = new JObject { ["type"] = "boolean", ["default"] = false },
                ["caseSensitive"] = new JObject { ["type"] = "boolean", ["default"] = true },
                ["context"] = new JObject { ["type"] = "integer", ["minimum"] = 0, ["maximum"] = 20, ["default"] = 0 },
                ["maxResults"] = new JObject { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 5000, ["default"] = 200 },
                ["extensions"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
            },
            ["required"] = new JArray { "pattern", "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var pattern = @params.Value<string>("pattern");
            var path = @params.Value<string>("path");
            if (string.IsNullOrEmpty(pattern))
                throw new ToolException("InvalidInput", "'pattern' is required and must be non-empty.");
            bool literal = @params.Value<bool?>("literal") ?? false;
            bool caseSensitive = @params.Value<bool?>("caseSensitive") ?? true;
            int context = @params.Value<int?>("context") ?? 0;
            int maxResults = @params.Value<int?>("maxResults") ?? 200;
            if (context < 0) context = 0;
            if (context > 20) context = 20;
            if (maxResults < 1) maxResults = 1;
            if (maxResults > 5000) maxResults = 5000;

            HashSet<string> extFilter = null;
            var extToken = @params["extensions"];
            if (extToken is JArray extArr && extArr.Count > 0)
            {
                extFilter = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var t in extArr) extFilter.Add(t.Value<string>());
            }

            var absolute = ScriptPathPolicy.ResolveForRead(path);
            var files = new List<string>();
            if (File.Exists(absolute))
            {
                files.Add(absolute);
            }
            else if (Directory.Exists(absolute))
            {
                var defaultExts = new[] { ".cs", ".uxml", ".uss", ".asmdef", ".shader", ".cginc", ".hlsl" };
                var allowed = extFilter ?? new HashSet<string>(defaultExts, StringComparer.OrdinalIgnoreCase);
                foreach (var f in Directory.EnumerateFiles(absolute, "*", SearchOption.AllDirectories))
                {
                    if (allowed.Contains(Path.GetExtension(f))) files.Add(f);
                }
            }
            else
            {
                throw new ToolException("InvalidInput", $"'{path}' is neither a file nor a directory.");
            }

            Regex regex;
            try
            {
                var options = caseSensitive ? RegexOptions.None : RegexOptions.IgnoreCase;
                regex = new Regex(literal ? Regex.Escape(pattern) : pattern, options | RegexOptions.Compiled);
            }
            catch (ArgumentException ex)
            {
                throw new ToolException("InvalidInput", $"Invalid regex pattern: {ex.Message}");
            }

            var projectRoot = Path.GetDirectoryName(Application.dataPath).Replace('\\', '/');
            var matches = new JArray();
            bool truncated = false;

            foreach (var file in files)
            {
                if (matches.Count >= maxResults) { truncated = true; break; }

                string[] lines;
                try { lines = File.ReadAllLines(file); }
                catch { continue; }

                var relPath = file.Replace('\\', '/');
                if (relPath.StartsWith(projectRoot + "/", StringComparison.OrdinalIgnoreCase))
                    relPath = relPath.Substring(projectRoot.Length + 1);

                for (int i = 0; i < lines.Length; i++)
                {
                    if (matches.Count >= maxResults) { truncated = true; break; }
                    if (!regex.IsMatch(lines[i])) continue;

                    var contextArr = new JArray();
                    if (context > 0)
                    {
                        int from = Math.Max(0, i - context);
                        int to = Math.Min(lines.Length - 1, i + context);
                        for (int c = from; c <= to; c++)
                        {
                            if (c == i) continue;
                            contextArr.Add(new JObject
                            {
                                ["line"] = c + 1,
                                ["text"] = lines[c],
                            });
                        }
                    }

                    matches.Add(new JObject
                    {
                        ["path"] = relPath,
                        ["line"] = i + 1,
                        ["text"] = lines[i],
                        ["context"] = contextArr,
                    });
                }
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["count"] = matches.Count,
                ["truncated"] = truncated,
                ["matches"] = matches,
            }));
        }
    }
}
