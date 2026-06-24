using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Reverts exactly ONE override — the property addressed by 'propertyPath' — on a scene prefab
    /// instance back to its source asset value, leaving the instance's other overrides untouched.
    /// 'propertyPath' uses the same SerializedProperty syntax as component_set_property. Registers
    /// Undo + marks the scene dirty. Counterpart to prefab_apply_override; works on variant
    /// instances.
    /// </summary>
    [UnityMcpTool("prefab_revert_override")]
    internal sealed class PrefabRevertOverrideTool : IUnityMcpTool
    {
        public string Name => "prefab_revert_override";

        public string Description =>
            "Revert ONE override (the property at 'propertyPath') on a scene prefab instance to its " +
            "source asset value, leaving other overrides untouched. 'propertyPath' uses " +
            "SerializedProperty syntax; get paths from prefab_overrides. Works on variant " +
            "instances. Undo recorded.";

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
            // deliberately left undisposed — RevertPropertyOverride needs it alive, and Unity
            // reclaims it after the call (this mirrors how custom inspectors revert overrides).
            var prop = PrefabOverrideResolver.FindOverrideProperty(go, propertyPath);

            // InteractionMode.UserAction records Undo on the instance for the reverted property.
            PrefabUtility.RevertPropertyOverride(prop, InteractionMode.UserAction);
            EditorSceneManager.MarkSceneDirty(go.scene);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["propertyPath"] = propertyPath,
                ["reverted"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
