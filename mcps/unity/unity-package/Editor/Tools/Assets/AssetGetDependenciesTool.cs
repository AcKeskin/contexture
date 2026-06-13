using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Returns dependencies of an asset. Direct deps by default; recursive=true returns
    /// the transitive closure. Each entry is { path, guid }. Errors when the asset path
    /// doesn't resolve.
    /// </summary>
    [UnityMcpTool("asset_get_dependencies")]
    internal sealed class AssetGetDependenciesTool : IUnityMcpTool
    {
        public string Name => "asset_get_dependencies";

        public string Description =>
            "Return dependencies of an asset. Defaults to direct deps; recursive=true returns " +
            "the transitive closure. Each entry includes asset path and GUID.";

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

            if (!File.Exists(path) && !Directory.Exists(path))
            {
                throw new ArgumentException($"No asset at '{path}'.");
            }

            var deps = AssetDatabase.GetDependencies(path, recursive) ?? Array.Empty<string>();

            var items = new JArray();
            foreach (var dep in deps)
            {
                items.Add(new JObject
                {
                    ["path"] = dep,
                    ["guid"] = AssetDatabase.AssetPathToGUID(dep) ?? string.Empty,
                    ["isSelf"] = string.Equals(dep, path, StringComparison.Ordinal),
                });
            }

            var data = new JObject
            {
                ["path"] = path,
                ["recursive"] = recursive,
                ["count"] = items.Count,
                ["items"] = items,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
