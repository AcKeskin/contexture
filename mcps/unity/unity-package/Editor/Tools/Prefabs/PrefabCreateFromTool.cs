using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Saves a scene GameObject as a prefab asset at a path. With connect=true (default),
    /// the scene instance becomes a prefab instance linked to the new asset; with connect=false,
    /// the scene object stays a plain GameObject and the asset is independent.
    /// </summary>
    [UnityMcpTool("prefab_create_from")]
    internal sealed class PrefabCreateFromTool : IUnityMcpTool
    {
        public string Name => "prefab_create_from";

        public string Description =>
            "Save a scene GameObject as a prefab asset at 'path'. With connect=true (default), " +
            "the scene instance becomes a prefab instance; connect=false keeps the scene object " +
            "independent. Returns the asset path + GUID + new instance ID when connected.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["path"] = new JObject { ["type"] = "string" },
                ["connect"] = new JObject { ["type"] = "boolean", ["default"] = true },
            },
            ["required"] = new JArray { "instanceId", "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ToolException("InvalidInput", "'path' is required.");
            }
            bool connect = @params["connect"]?.Value<bool>() ?? true;

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (PrefabUtility.IsPartOfPrefabAsset(go))
            {
                throw new ToolException("InvalidInput", "Source must be a scene GameObject, not a prefab asset.");
            }

            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
                AssetDatabase.Refresh();
            }

            GameObject created;
            if (connect)
            {
                created = PrefabUtility.SaveAsPrefabAssetAndConnect(go, path, InteractionMode.UserAction);
            }
            else
            {
                created = PrefabUtility.SaveAsPrefabAsset(go, path);
            }

            if (created == null)
            {
                throw new ToolException("Internal",
                    $"PrefabUtility.SaveAsPrefab* returned null for '{path}'.");
            }

            var data = new JObject
            {
                ["path"] = path,
                ["guid"] = AssetDatabase.AssetPathToGUID(path) ?? string.Empty,
                ["assetInstanceId"] = created.GetInstanceID(),
                ["sourceInstanceId"] = id,
                ["connected"] = connect,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
