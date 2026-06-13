using System;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Triggers a reimport of an asset path. Useful after the agent or user has dropped
    /// files into the project outside Unity's awareness, or after touching imported asset
    /// settings programmatically. 'recursive' applies when the path is a folder.
    /// </summary>
    [UnityMcpTool("asset_import")]
    internal sealed class AssetImportTool : IUnityMcpTool
    {
        public string Name => "asset_import";

        public string Description =>
            "Reimport an asset (or a folder when recursive=true). Forces Unity's importer to " +
            "re-process the file. Returns whether the path resolved and was reimported.";

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

            // AssetDatabase paths are project-relative ('Assets/...'). File.Exists confirms
            // the file is on disk before we ask the importer to look at it.
            if (!File.Exists(path) && !Directory.Exists(path))
            {
                throw new ArgumentException($"No asset at '{path}'.");
            }

            var options = recursive
                ? ImportAssetOptions.ImportRecursive | ImportAssetOptions.ForceUpdate
                : ImportAssetOptions.ForceUpdate;
            AssetDatabase.ImportAsset(path, options);

            var data = new JObject
            {
                ["path"] = path,
                ["recursive"] = recursive,
                ["imported"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
