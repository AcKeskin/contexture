using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Applies all overrides from a scene-instance prefab back to its source asset.
    /// Errors when the GameObject is not a prefab instance, or when it's a variant
    /// (variant routing deferred to v3 — apply requires variant-specific paths in
    /// PrefabUtility that exceed v2's complexity budget).
    /// </summary>
    [UnityMcpTool("prefab_apply_overrides")]
    internal sealed class PrefabApplyOverridesTool : IUnityMcpTool
    {
        public string Name => "prefab_apply_overrides";

        public string Description =>
            "Apply all overrides from a scene-instance prefab back to its source asset. " +
            "Errors if the GameObject is not a prefab instance, or if it is a prefab variant " +
            "(variant routing deferred to v3).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ArgumentException("GameObject is not a prefab instance.");
            }
            if (PrefabUtility.IsPartOfVariantPrefab(go))
            {
                throw new ArgumentException(
                    "Prefab variants are not supported by prefab_apply_overrides in v2. " +
                    "Edit the variant's source asset directly via the Project window.");
            }

            var assetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go);
            PrefabUtility.ApplyPrefabInstance(go, InteractionMode.UserAction);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["assetPath"] = assetPath ?? string.Empty,
                ["applied"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
