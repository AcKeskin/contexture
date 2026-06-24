using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Reports the full override picture for a scene prefab instance: per-property modifications
    /// (each carrying its SerializedProperty 'propertyPath' — the addressing key for
    /// prefab_apply_override / prefab_revert_override), added components, removed components, and
    /// added GameObjects. Works on standard AND variant instances — this is the variant-inspection
    /// surface that prefab_apply_overrides rejects. Read-only; no Undo/dirty.
    /// </summary>
    [UnityMcpTool("prefab_overrides")]
    internal sealed class PrefabOverridesTool : IUnityMcpTool
    {
        public string Name => "prefab_overrides";

        public string Description =>
            "Report the full override picture for a scene prefab instance: propertyOverrides " +
            "(each with its 'propertyPath'), addedComponents, removedComponents, addedGameObjects. " +
            "Works on standard and variant instances. 'propertyPath' values address " +
            "prefab_apply_override / prefab_revert_override. Read-only.";

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

            // Property modifications carry the SerializedProperty path + the target object they
            // apply to. The path is the addressing key the per-property apply/revert tools take.
            var propertyOverrides = new JArray();
            var mods = PrefabUtility.GetPropertyModifications(go);
            if (mods != null)
            {
                foreach (var m in mods)
                {
                    if (m == null) continue;
                    var target = m.target;
                    propertyOverrides.Add(new JObject
                    {
                        ["propertyPath"] = m.propertyPath ?? string.Empty,
                        ["value"] = m.value ?? string.Empty,
                        ["targetType"] = target != null ? target.GetType().Name : "<null>",
                        ["targetInstanceId"] = target != null ? (JToken)target.GetInstanceID() : JValue.CreateNull(),
                        ["objectReferenceInstanceId"] = m.objectReference != null
                            ? (JToken)m.objectReference.GetInstanceID()
                            : JValue.CreateNull(),
                    });
                }
            }

            var addedComponents = new JArray();
            foreach (var ac in PrefabUtility.GetAddedComponents(go))
            {
                if (ac?.instanceComponent == null) continue;
                addedComponents.Add(new JObject
                {
                    ["type"] = ac.instanceComponent.GetType().Name,
                    ["instanceId"] = ac.instanceComponent.GetInstanceID(),
                    ["ownerInstanceId"] = ac.instanceComponent.gameObject.GetInstanceID(),
                });
            }

            var removedComponents = new JArray();
            foreach (var rc in PrefabUtility.GetRemovedComponents(go))
            {
                if (rc?.assetComponent == null) continue;
                removedComponents.Add(new JObject
                {
                    ["type"] = rc.assetComponent.GetType().Name,
                    ["assetInstanceId"] = rc.assetComponent.GetInstanceID(),
                    ["containingInstanceId"] = rc.containingInstanceGameObject != null
                        ? (JToken)rc.containingInstanceGameObject.GetInstanceID()
                        : JValue.CreateNull(),
                });
            }

            var addedGameObjects = new JArray();
            foreach (var ag in PrefabUtility.GetAddedGameObjects(go))
            {
                if (ag?.instanceGameObject == null) continue;
                addedGameObjects.Add(new JObject
                {
                    ["name"] = ag.instanceGameObject.name,
                    ["instanceId"] = ag.instanceGameObject.GetInstanceID(),
                    ["parentInstanceId"] = ag.instanceGameObject.transform.parent != null
                        ? (JToken)ag.instanceGameObject.transform.parent.gameObject.GetInstanceID()
                        : JValue.CreateNull(),
                });
            }

            var data = new JObject
            {
                ["instanceId"] = id,
                ["assetPath"] = assetPath ?? string.Empty,
                ["isVariant"] = PrefabUtility.IsPartOfVariantPrefab(go),
                ["propertyOverrides"] = propertyOverrides,
                ["addedComponents"] = addedComponents,
                ["removedComponents"] = removedComponents,
                ["addedGameObjects"] = addedGameObjects,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
