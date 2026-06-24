using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Applies all overrides from a scene-instance prefab back to its source asset (the coarse,
    /// all-or-nothing apply). Errors when the GameObject is not a prefab instance, or when it's a
    /// variant — variant-aware apply is served by the granular per-property tools instead:
    /// inspect with prefab_overrides, then prefab_apply_override / prefab_revert_override by
    /// propertyPath. The variant rejection here carries details { variant: true } so callers can
    /// branch to that path.
    /// </summary>
    [UnityMcpTool("prefab_apply_overrides")]
    internal sealed class PrefabApplyOverridesTool : IUnityMcpTool
    {
        public string Name => "prefab_apply_overrides";

        public string Description =>
            "Apply ALL overrides from a scene-instance prefab back to its source asset (coarse). " +
            "Errors if the GameObject is not a prefab instance, or if it is a prefab variant — " +
            "for variants (or single-property control) use prefab_overrides + " +
            "prefab_apply_override / prefab_revert_override.";

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
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ToolException("InvalidInput", "GameObject is not a prefab instance.");
            }
            if (PrefabUtility.IsPartOfVariantPrefab(go))
            {
                throw new ToolException(
                    "InvalidInput",
                    "Prefab variants are not supported by prefab_apply_overrides. " +
                    "Use prefab_apply_override (single-property) on a variant instance, or edit the variant asset via prefab_edit.",
                    new JObject { ["variant"] = true });
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
