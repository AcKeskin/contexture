using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Errors when a BoundsControl has no Target / Boundsoverride resolved —
    /// the gizmo has nothing to wrap.
    /// </summary>
    internal sealed class BoundsControlHasTarget : IComponentValidationRule
    {
        public string AppliesTo => "BoundsControl";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                // BoundsControl.Target is the override; falls back to the same GO when null.
                var targetProp = so.FindProperty("target") ?? so.FindProperty("Target");
                if (targetProp != null && targetProp.propertyType == SerializedPropertyType.ObjectReference)
                {
                    if (targetProp.objectReferenceValue == null)
                    {
                        // Fallback: BoundsControl can self-target. Warn only if the GO has no
                        // Renderer or Collider to derive bounds from.
                        var go = target.gameObject;
                        var hasGeometry = go.GetComponentInChildren<Renderer>(true) != null
                            || go.GetComponentInChildren<Collider>(true) != null;
                        if (!hasGeometry)
                        {
                            yield return new ValidationFinding(
                                "error",
                                $"BoundsControl on '{go.name}' has no Target override and no Renderer/Collider in subtree to derive bounds from.",
                                "Either set BoundsControl.Target explicitly or add a Renderer/Collider whose bounds the gizmo can wrap.",
                                nameof(BoundsControlHasTarget));
                        }
                    }
                }
            }
        }
    }
}
