using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Deletes an asset (or a folder when recursive=true). Errors when the path does not
    /// resolve, or when the path is a non-empty folder and recursive is false.
    /// </summary>
    [UnityMcpTool("asset_delete")]
    internal sealed class AssetDeleteTool : IUnityMcpTool
    {
        public string Name => "asset_delete";

        public string Description =>
            "Delete an asset by path. For folders, set recursive=true; otherwise the call " +
            "errors when the path is a non-empty directory.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["recursive"] = new JObject { ["type"] = "boolean", ["default"] = false },
            },
            ["required"] = new JArray { "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("'path' is required.");
            }
            bool recursive = @params["recursive"]?.Value<bool>() ?? false;

            bool isDir = Directory.Exists(path);
            if (!isDir && !File.Exists(path))
            {
                throw new ArgumentException($"No asset at '{path}'.");
            }
            if (isDir && !recursive && Directory.EnumerateFileSystemEntries(path).Any())
            {
                throw new ArgumentException(
                    $"'{path}' is a non-empty directory; pass recursive=true to delete it.");
            }

            bool deleted = AssetDatabase.DeleteAsset(path);
            AssetDatabase.Refresh();

            var data = new JObject
            {
                ["path"] = path,
                ["deleted"] = deleted,
                ["recursive"] = recursive,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
