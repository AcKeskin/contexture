using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Scripts
{
    /// <summary>
    /// Apply mechanical edits to a file as one atomic transaction. Three edit
    /// kinds:
    /// - insert_at_line: insert text BEFORE the given 1-based line number.
    /// - replace_line_range: replace lines [fromLine..toLine] (inclusive) with
    ///   text.
    /// - replace_string: substitute the first occurrence of `find` with
    ///   `replace`. Set `all:true` to replace every occurrence.
    ///
    /// Edits apply in array order, with each subsequent edit operating on the
    /// result of the previous one. The optional `expectedHash` guards against
    /// concurrent edits — if the hash doesn't match the file's current state,
    /// the whole transaction errors and nothing is written. Returns the post-
    /// edit content + hash + how many edits applied.
    /// </summary>
    [UnityMcpTool("script_apply_edits")]
    internal sealed class ScriptApplyEditsTool : IUnityMcpTool
    {
        public string Name => "script_apply_edits";

        public string Description =>
            "Apply mechanical edits atomically to a file. Required: 'path' (project-" +
            "relative) and 'edits' (array of edits). Each edit is { kind: " +
            "'insert_at_line'|'replace_line_range'|'replace_string', ... }. " +
            "insert_at_line: { kind, line: <1-based>, text }. " +
            "replace_line_range: { kind, fromLine, toLine, text }. " +
            "replace_string: { kind, find, replace, all? (default false) }. " +
            "Optional 'expectedHash' for concurrent-edit guard. Edits apply in " +
            "order; each operates on the result of the previous. All-or-nothing.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["expectedHash"] = new JObject { ["type"] = "string" },
                ["edits"] = new JObject
                {
                    ["type"] = "array",
                    ["minItems"] = 1,
                    ["items"] = new JObject { ["type"] = "object" },
                },
            },
            ["required"] = new JArray { "path", "edits" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var path = @params.Value<string>("path");
            var expectedHash = @params.Value<string>("expectedHash");
            var editsArr = @params["edits"] as JArray;
            if (editsArr == null || editsArr.Count == 0)
                throw new ToolException("InvalidInput", "'edits' is required and must be a non-empty array.");

            var absolute = ScriptPathPolicy.ResolveForWrite(path);
            if (!File.Exists(absolute))
                throw new ToolException("InvalidInput", $"File not found: '{path}'.");

            var current = File.ReadAllText(absolute);
            if (!string.IsNullOrEmpty(expectedHash))
            {
                var currentHash = ManageScriptTool.Sha256(current);
                if (!string.Equals(currentHash, expectedHash, StringComparison.OrdinalIgnoreCase))
                {
                    throw new ToolException("InvalidInput",
                        $"Concurrent-edit guard tripped: expectedHash {expectedHash} does not match current file hash {currentHash}.");
                }
            }

            int applied = 0;
            for (int i = 0; i < editsArr.Count; i++)
            {
                var edit = editsArr[i] as JObject
                    ?? throw new ToolException("InvalidInput", $"edits[{i}] is not an object.");
                var kind = edit.Value<string>("kind");
                switch (kind)
                {
                    case "insert_at_line":
                        current = ApplyInsertAtLine(current, edit, i);
                        break;
                    case "replace_line_range":
                        current = ApplyReplaceLineRange(current, edit, i);
                        break;
                    case "replace_string":
                        current = ApplyReplaceString(current, edit, i);
                        break;
                    default:
                        throw new ToolException("InvalidInput",
                            $"edits[{i}].kind must be one of insert_at_line|replace_line_range|replace_string; got '{kind}'.");
                }
                applied++;
            }

            File.WriteAllText(absolute, current, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["path"] = path,
                ["editsApplied"] = applied,
                ["sizeBytes"] = Encoding.UTF8.GetByteCount(current),
                ["hash"] = ManageScriptTool.Sha256(current),
                ["content"] = current,
            }));
        }

        private static string ApplyInsertAtLine(string current, JObject edit, int idx)
        {
            int line = edit.Value<int?>("line")
                ?? throw new ToolException("InvalidInput", $"edits[{idx}].line is required.");
            var text = edit.Value<string>("text") ?? string.Empty;

            var lines = SplitKeepEol(current);
            if (line < 1 || line > lines.Count + 1)
                throw new ToolException("InvalidInput",
                    $"edits[{idx}].line {line} is out of range; valid range is [1, {lines.Count + 1}].");

            // Normalize text to end with \n if non-empty and missing it, so the
            // inserted block doesn't fuse with the next existing line.
            if (!text.EndsWith("\n") && text.Length > 0) text += "\n";
            lines.Insert(line - 1, text);
            return string.Concat(lines);
        }

        private static string ApplyReplaceLineRange(string current, JObject edit, int idx)
        {
            int fromLine = edit.Value<int?>("fromLine")
                ?? throw new ToolException("InvalidInput", $"edits[{idx}].fromLine is required.");
            int toLine = edit.Value<int?>("toLine")
                ?? throw new ToolException("InvalidInput", $"edits[{idx}].toLine is required.");
            var text = edit.Value<string>("text") ?? string.Empty;

            var lines = SplitKeepEol(current);
            if (fromLine < 1 || toLine < fromLine || toLine > lines.Count)
                throw new ToolException("InvalidInput",
                    $"edits[{idx}] line range [{fromLine},{toLine}] is invalid; file has {lines.Count} lines.");

            int countToRemove = toLine - fromLine + 1;
            lines.RemoveRange(fromLine - 1, countToRemove);
            if (!text.EndsWith("\n") && text.Length > 0) text += "\n";
            if (text.Length > 0) lines.Insert(fromLine - 1, text);
            return string.Concat(lines);
        }

        private static string ApplyReplaceString(string current, JObject edit, int idx)
        {
            var find = edit.Value<string>("find")
                ?? throw new ToolException("InvalidInput", $"edits[{idx}].find is required.");
            var replace = edit.Value<string>("replace") ?? string.Empty;
            bool all = edit.Value<bool?>("all") ?? false;
            if (string.IsNullOrEmpty(find))
                throw new ToolException("InvalidInput", $"edits[{idx}].find must be non-empty.");

            int firstIndex = current.IndexOf(find, StringComparison.Ordinal);
            if (firstIndex < 0)
                throw new ToolException("InvalidInput",
                    $"edits[{idx}] replace_string: 'find' string not found in file.");

            // Ambiguity guard: when all:false (default) and 'find' matches more
            // than once, the agent likely thought its find string was unique.
            // Silently replacing only the first match produces a wrong-but-
            // believable result. Force the caller to disambiguate (set all:true
            // to replace every occurrence, or narrow the find string).
            if (!all)
            {
                int secondIndex = current.IndexOf(find, firstIndex + find.Length, StringComparison.Ordinal);
                if (secondIndex >= 0)
                {
                    int matchCount = 1;
                    int next = secondIndex;
                    while (next >= 0)
                    {
                        matchCount++;
                        next = current.IndexOf(find, next + find.Length, StringComparison.Ordinal);
                    }
                    throw new ToolException("InvalidInput",
                        $"edits[{idx}] replace_string: 'find' matched {matchCount} times. " +
                        "Pass all:true to replace every occurrence, or narrow the find string so it matches exactly once.");
                }
            }

            return all ? current.Replace(find, replace)
                       : current.Substring(0, firstIndex) + replace + current.Substring(firstIndex + find.Length);
        }

        /// <summary>
        /// Split content into lines while preserving each line's terminator.
        /// Mirrors how a text editor sees the file so insert/replace operations
        /// don't normalize CRLF vs LF behind the user's back.
        /// </summary>
        private static List<string> SplitKeepEol(string text)
        {
            var lines = new List<string>();
            int start = 0;
            for (int i = 0; i < text.Length; i++)
            {
                if (text[i] == '\n')
                {
                    lines.Add(text.Substring(start, i - start + 1));
                    start = i + 1;
                }
            }
            if (start < text.Length) lines.Add(text.Substring(start));
            return lines;
        }
    }
}
