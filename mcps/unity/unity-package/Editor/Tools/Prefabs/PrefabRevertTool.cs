using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Reverts all overrides on a scene-instance prefab back to the source asset's values.
    /// Errors when the GameObject is not a prefab instance.
    /// </summary>
    [UnityMcpTool("prefab_revert")]
    internal sealed class PrefabRevertTool : IUnityMcpTool
    {
        public string Name => "prefab_revert";

        public string Description =>
            "Revert all overrides on a scene-instance prefab to the source asset's values. " +
            "Works on both standard and variant prefabs.";

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

            var assetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go);
            PrefabUtility.RevertPrefabInstance(go, InteractionMode.UserAction);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["assetPath"] = assetPath ?? string.Empty,
                ["reverted"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
