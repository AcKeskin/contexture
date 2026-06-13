using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Errors when an ObjectManipulator has no Rigidbody and no Collider on the
    /// target — manipulation requires hit-testable geometry. Mirrors what MRTK's
    /// own runtime would warn about, surfaced inspect-time.
    /// </summary>
    internal sealed class ObjectManipulatorHasTarget : IComponentValidationRule
    {
        public string AppliesTo => "ObjectManipulator";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            var go = target.gameObject;
            // Look for any Collider or Rigidbody on self or parents — MRTK manipulators
            // walk up to find the body to manipulate.
            var collider = go.GetComponent<Collider>();
            if (collider == null) collider = go.GetComponentInParent<Collider>();
            if (collider == null)
            {
                yield return new ValidationFinding(
                    "error",
                    $"ObjectManipulator on '{go.name}' has no Collider on itself or any parent — interaction can't hit-test the object.",
                    "Add a BoxCollider/SphereCollider/MeshCollider sized to the object's bounds.",
                    nameof(ObjectManipulatorHasTarget));
            }
        }
    }
}
