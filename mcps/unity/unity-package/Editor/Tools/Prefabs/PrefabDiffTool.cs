using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools.Diff;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Returns the structured difference between a scene prefab instance and its linked asset,
    /// computed with the full-fidelity serializer. Output is a flat list of { path, before, after }
    /// leaves (before = the instance, after = the linked asset). Read-only.
    /// </summary>
    [UnityMcpTool("prefab_diff")]
    internal sealed class PrefabDiffTool : IUnityMcpTool
    {
        public string Name => "prefab_diff";

        public string Description =>
            "Diff a scene prefab instance against its linked asset (full-fidelity). Returns " +
            "{ instanceId, assetPath, differences: [{path, before, after}] } where 'before' is the " +
            "instance and 'after' is the asset. 'depth' (default 1, max 4) bounds child expansion. " +
            "Read-only.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["depth"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 0,
                    ["maximum"] = 4,
                    ["default"] = 1,
                },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            int depth = @params["depth"]?.Value<int>() ?? 1;
            if (depth < 0) depth = 0;
            if (depth > 4) depth = 4;

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ToolException("InvalidInput", "GameObject is not a prefab instance.");
            }

            var asset = PrefabUtility.GetCorrespondingObjectFromSource(go);
            if (asset == null)
            {
                throw new ToolException("InvalidInput",
                    "Could not resolve the linked prefab asset for this instance.");
            }

            var assetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go);
            var differences = StructuralDiff.DiffGameObjects(go, asset, depth);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["assetPath"] = assetPath ?? string.Empty,
                ["differences"] = differences,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
