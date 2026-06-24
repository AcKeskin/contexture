using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Prefabs
{
    /// <summary>
    /// Resolves a SerializedProperty addressed by a 'propertyPath' on a prefab instance, for the
    /// single-property apply/revert tools. A propertyPath reported by prefab_overrides belongs to
    /// a specific target object (the GameObject or one of its components); this finds the property
    /// on whichever target carries it, returning a live SerializedProperty that
    /// PrefabUtility.ApplyPropertyOverride / RevertPropertyOverride can act on.
    ///
    /// The returned property's owning SerializedObject is intentionally NOT disposed here — the
    /// SerializedProperty must outlive this call so the apply/revert overload can use it. Unity
    /// reclaims it after the operation; for a single editor-tool invocation this is the standard
    /// trade-off (mirrors how property overrides are applied from custom inspectors).
    /// </summary>
    internal static class PrefabOverrideResolver
    {
        public static SerializedProperty FindOverrideProperty(GameObject instance, string propertyPath)
        {
            // Try the GameObject itself first (paths like 'm_Name', 'm_IsActive'), then every
            // component on it (paths like 'm_LocalPosition.x' on Transform, or any component field).
            var goProp = TryFind(instance, propertyPath);
            if (goProp != null) return goProp;

            foreach (var comp in instance.GetComponents<Component>())
            {
                if (comp == null) continue;
                var compProp = TryFind(comp, propertyPath);
                if (compProp != null) return compProp;
            }

            throw new ToolException("InvalidInput",
                $"propertyPath '{propertyPath}' did not resolve to a property on the instance or " +
                $"any of its components. Use prefab_overrides to list valid override paths.");
        }

        private static SerializedProperty TryFind(Object target, string propertyPath)
        {
            var so = new SerializedObject(target);
            var p = so.FindProperty(propertyPath);
            if (p != null) return p;
            so.Dispose();
            return null;
        }
    }
}
