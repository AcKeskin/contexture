using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Assets
{
    /// <summary>
    /// Wraps AssetDatabase.FindAssets. Accepts the native filter syntax —
    /// "t:Material name", "t:ScriptableObject", "l:Player" — and returns matching
    /// asset paths + GUIDs. Capped at 'limit' (default 200, max 2000) to avoid blowing
    /// up the wire payload.
    /// </summary>
    [UnityMcpTool("asset_find")]
    internal sealed class AssetFindTool : IUnityMcpTool
    {
        public string Name => "asset_find";

        public string Description =>
            "Search for assets via AssetDatabase.FindAssets. 'filter' uses Unity's native " +
            "filter syntax: 't:Material name' (type + name), 't:ScriptableObject', 'l:Player' " +
            "(label). Optional 'searchInFolders' restricts the scan. Returns items with guid, path, and instanceId.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["filter"] = new JObject { ["type"] = "string" },
                ["searchInFolders"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["limit"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 1,
                    ["maximum"] = 2000,
                    ["default"] = 200,
                },
            },
            ["required"] = new JArray { "filter" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string filter = @params.Value<string>("filter");
            if (string.IsNullOrWhiteSpace(filter))
            {
                throw new ArgumentException("'filter' is required.");
            }
            int limit = @params["limit"]?.Value<int>() ?? 200;
            if (limit < 1) limit = 1;
            if (limit > 2000) limit = 2000;

            string[] folders = null;
            if (@params["searchInFolders"] is JArray foldersArr && foldersArr.Count > 0)
            {
                folders = new string[foldersArr.Count];
                for (int i = 0; i < foldersArr.Count; i++) folders[i] = foldersArr[i].Value<string>();
            }

            var guids = folders == null
                ? AssetDatabase.FindAssets(filter)
                : AssetDatabase.FindAssets(filter, folders);

            int total = guids?.Length ?? 0;
            int returned = Math.Min(total, limit);

            var items = new JArray();
            for (int i = 0; i < returned; i++)
            {
                var guid = guids[i];
                var path = AssetDatabase.GUIDToAssetPath(guid) ?? string.Empty;
                var loaded = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);
                items.Add(new JObject
                {
                    ["guid"] = guid,
                    ["path"] = path,
                    ["instanceId"] = loaded != null ? (JToken)loaded.GetInstanceID() : 0,
                });
            }

            var data = new JObject
            {
                ["filter"] = filter,
                ["count"] = items.Count,
                ["totalMatches"] = total,
                ["truncated"] = total > limit,
                ["items"] = items,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
