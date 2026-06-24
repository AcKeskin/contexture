using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Applies exactly ONE override — the property addressed by 'propertyPath' — from a scene
    /// prefab instance to its source asset, leaving the instance's other overrides untouched.
    /// 'propertyPath' uses the same SerializedProperty syntax as component_set_property
    /// (e.g. 'm_LocalPosition.x'). Registers Undo + marks the asset dirty. Counterpart to
    /// prefab_revert_override; both supersede the all-or-nothing prefab_apply_overrides for
    /// granular control and work on variant instances.
    /// </summary>
    [UnityMcpTool("prefab_apply_override")]
    internal sealed class PrefabApplyOverrideTool : IUnityMcpTool
    {
        public string Name => "prefab_apply_override";

        public string Description =>
            "Apply ONE override (the property at 'propertyPath') from a scene prefab instance to " +
            "its source asset, leaving other overrides untouched. 'propertyPath' uses " +
            "SerializedProperty syntax ('m_LocalPosition.x'); get paths from prefab_overrides. " +
            "Works on variant instances. Undo recorded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["propertyPath"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "instanceId", "propertyPath" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            string propertyPath = @params.Value<string>("propertyPath");
            if (string.IsNullOrWhiteSpace(propertyPath))
            {
                throw new ToolException("InvalidInput", "'propertyPath' is required.");
            }

            var go = InstanceIdResolver.GameObjectOrThrow(id);
            if (!PrefabUtility.IsPartOfPrefabInstance(go))
            {
                throw new ToolException("InvalidInput", "GameObject is not a prefab instance.");
            }

            // The resolver returns a live SerializedProperty whose owning SerializedObject is
            // deliberately left undisposed — ApplyPropertyOverride needs it alive, and Unity
            // reclaims it after the call (this mirrors how custom inspectors apply overrides).
            var prop = PrefabOverrideResolver.FindOverrideProperty(go, propertyPath);

            var assetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go);
            // Apply the single property to the outermost prefab asset. InteractionMode.UserAction
            // routes through Unity's standard apply path (records Undo, marks the asset dirty).
            PrefabUtility.ApplyPropertyOverride(prop, assetPath, InteractionMode.UserAction);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["propertyPath"] = propertyPath,
                ["assetPath"] = assetPath ?? string.Empty,
                ["applied"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
