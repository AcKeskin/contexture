using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Centralized instance-id → Unity Object resolution. Throws <see cref="ToolException"/>
    /// with code "InvalidInput" and a consistent message when the id does not resolve to
    /// the expected type. Eliminates the hand-rolled lookup-then-throw pattern repeated
    /// across every tool that takes an instanceId argument.
    /// </summary>
    internal static class InstanceIdResolver
    {
        // EditorUtility.InstanceIDToObject(int) is "deprecated" on Unity 6 in favor of
        // EntityIdToObject(EntityId), but the new API doesn't exist on the package's Unity
        // 2021.3 LTS floor. Suppress the warning at call sites until the floor moves to
        // Unity 6+ (deferred to v3).
        #pragma warning disable CS0618
        public static GameObject GameObjectOrThrow(int id, string fieldName = "instanceId")
        {
            var go = EditorUtility.InstanceIDToObject(id) as GameObject;
            if (go == null)
            {
                throw new ToolException("InvalidInput",
                    $"{fieldName} {id} did not resolve to a GameObject.");
            }
            return go;
        }

        public static Component ComponentOrThrow(int id, string fieldName = "componentInstanceId")
        {
            var comp = EditorUtility.InstanceIDToObject(id) as Component;
            if (comp == null)
            {
                throw new ToolException("InvalidInput",
                    $"{fieldName} {id} did not resolve to a Component.");
            }
            return comp;
        }

        /// <summary>
        /// Resolves a RectTransform from either a RectTransform instanceId or a
        /// GameObject instanceId whose GameObject has a RectTransform component.
        /// Throws <c>InvalidInput</c> when the id is unresolvable or the resolved
        /// object isn't a RectTransform (and, for GameObjects, doesn't carry one).
        /// </summary>
        public static RectTransform RectTransformOrThrow(int id, string fieldName = "rectTransformInstanceId")
        {
            var obj = EditorUtility.InstanceIDToObject(id);
            if (obj == null)
            {
                throw new ToolException("InvalidInput",
                    $"{fieldName} {id} did not resolve to a RectTransform.");
            }
            if (obj is RectTransform rt) return rt;
            if (obj is GameObject go)
            {
                var goRt = go.GetComponent<RectTransform>();
                if (goRt != null) return goRt;
                throw new ToolException("InvalidInput",
                    $"{fieldName} {id} is a GameObject without a RectTransform.");
            }
            throw new ToolException("InvalidInput",
                $"{fieldName} {id} is {obj.GetType().Name}, not a RectTransform.");
        }
        #pragma warning restore CS0618
    }
}
