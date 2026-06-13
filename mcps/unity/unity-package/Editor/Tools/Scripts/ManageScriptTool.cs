using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Scripts
{
    /// <summary>
    /// Read / create / replace / delete .cs (and other script-shaped) files under
    /// the project's writable scope. Reads are broad (any in-project path);
    /// writes restrict to Assets/ and the unity-mcp package per ScriptPathPolicy.
    ///
    /// The replace path supports an optional `expectedHash` (SHA-256 hex of the
    /// file's current content) so the agent can detect a concurrent edit and
    /// avoid clobbering. Hash is uppercase hex; absent → no concurrency check.
    ///
    /// Writes go through File.WriteAllText + AssetDatabase.ImportAsset so Unity
    /// picks up the change synchronously. Encoding is UTF-8 without BOM (matches
    /// Unity's default for new C# scripts).
    /// </summary>
    [UnityMcpTool("manage_script")]
    internal sealed class ManageScriptTool : IUnityMcpTool
    {
        public string Name => "manage_script";

        public string Description =>
            "Read / create / replace / delete .cs (and other script-shaped) files. " +
            "Required: 'action' (read|create|replace|delete) and 'path' (project-relative, " +
            "e.g. 'Assets/Scripts/Foo.cs'). For create/replace also supply 'content' (string). " +
            "For replace, optionally pass 'expectedHash' (SHA-256 uppercase hex of current " +
            "file content) to guard against concurrent edits. Returns { action, path, " +
            "exists, hash, sizeBytes, content? }. Reads work under any in-project path; " +
            "writes restricted to Assets/ and the com.ackeskin.unity-mcp package. Out-of-project " +
            "paths and absolute paths are rejected.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "read", "create", "replace", "delete" },
                },
                ["path"] = new JObject { ["type"] = "string" },
                ["content"] = new JObject { ["type"] = "string" },
                ["expectedHash"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "action", "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            var path = @params.Value<string>("path");

            switch (action)
            {
                case "read":   return Task.FromResult(Read(path));
                case "create": return Task.FromResult(Create(path, @params.Value<string>("content")));
                case "replace":
                    return Task.FromResult(Replace(path, @params.Value<string>("content"), @params.Value<string>("expectedHash")));
                case "delete": return Task.FromResult(Delete(path));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be one of read|create|replace|delete; got '{action}'.");
            }
        }

        private static ToolResult Read(string path)
        {
            var absolute = ScriptPathPolicy.ResolveForRead(path);
            if (!File.Exists(absolute))
                throw new ToolException("InvalidInput", $"File not found: '{path}'.");

            var content = File.ReadAllText(absolute);
            var bytes = Encoding.UTF8.GetByteCount(content);
            return ToolResult.Json(new JObject
            {
                ["action"] = "read",
                ["path"] = path,
                ["exists"] = true,
                ["sizeBytes"] = bytes,
                ["hash"] = Sha256(content),
                ["content"] = content,
            });
        }

        private static ToolResult Create(string path, string content)
        {
            if (content == null)
                throw new ToolException("InvalidInput", "'content' is required for action=create.");
            if (!ScriptPathPolicy.IsScriptExtension(path))
                throw new ToolException("InvalidInput",
                    $"Path '{path}' does not have a script extension (.cs/.asmdef/.uxml/.uss/.shader/.cginc/.hlsl/.asmref).");

            var absolute = ScriptPathPolicy.ResolveForWrite(path);
            if (File.Exists(absolute))
                throw new ToolException("InvalidInput",
                    $"File already exists: '{path}'. Use action=replace to overwrite.");

            var dir = Path.GetDirectoryName(absolute);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            File.WriteAllText(absolute, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);

            var bytes = Encoding.UTF8.GetByteCount(content);
            return ToolResult.Json(new JObject
            {
                ["action"] = "create",
                ["path"] = path,
                ["exists"] = true,
                ["sizeBytes"] = bytes,
                ["hash"] = Sha256(content),
            });
        }

        private static ToolResult Replace(string path, string content, string expectedHash)
        {
            if (content == null)
                throw new ToolException("InvalidInput", "'content' is required for action=replace.");

            var absolute = ScriptPathPolicy.ResolveForWrite(path);
            if (!File.Exists(absolute))
                throw new ToolException("InvalidInput",
                    $"File not found: '{path}'. Use action=create to create it.");

            if (!string.IsNullOrEmpty(expectedHash))
            {
                var current = File.ReadAllText(absolute);
                var currentHash = Sha256(current);
                if (!string.Equals(currentHash, expectedHash, StringComparison.OrdinalIgnoreCase))
                {
                    throw new ToolException("InvalidInput",
                        $"Concurrent-edit guard tripped: expectedHash {expectedHash} does not match current file hash {currentHash}. " +
                        "Re-read the file and retry with the new hash.");
                }
            }

            File.WriteAllText(absolute, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);

            var bytes = Encoding.UTF8.GetByteCount(content);
            return ToolResult.Json(new JObject
            {
                ["action"] = "replace",
                ["path"] = path,
                ["exists"] = true,
                ["sizeBytes"] = bytes,
                ["hash"] = Sha256(content),
            });
        }

        private static ToolResult Delete(string path)
        {
            var absolute = ScriptPathPolicy.ResolveForWrite(path);
            if (!File.Exists(absolute))
                throw new ToolException("InvalidInput", $"File not found: '{path}'.");

            // AssetDatabase.DeleteAsset removes both the file and the .meta.
            bool ok = AssetDatabase.DeleteAsset(path);
            if (!ok)
                throw new ToolException("ToolError",
                    $"AssetDatabase.DeleteAsset returned false for '{path}' — the file may be locked or referenced.");

            return ToolResult.Json(new JObject
            {
                ["action"] = "delete",
                ["path"] = path,
                ["exists"] = false,
            });
        }

        public static string Sha256(string text)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(text ?? string.Empty));
                var sb = new StringBuilder(bytes.Length * 2);
                foreach (var b in bytes) sb.Append(b.ToString("X2"));
                return sb.ToString();
            }
        }
    }
}
