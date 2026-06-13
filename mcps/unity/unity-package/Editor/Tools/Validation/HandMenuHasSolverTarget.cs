using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Errors when a HandConstraintPalmUp has no SolverHandler.TrackedTargetType resolved —
    /// the hand menu won't follow anything if the solver target field is unset.
    /// </summary>
    internal sealed class HandMenuHasSolverTarget : IComponentValidationRule
    {
        public string AppliesTo => "HandConstraintPalmUp";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            // The hand menu requires a SolverHandler sibling to drive tracking.
            var handler = target.gameObject.GetComponent("SolverHandler") as Component;
            if (handler == null)
            {
                yield return new ValidationFinding(
                    "error",
                    $"HandConstraintPalmUp on '{target.gameObject.name}' has no SolverHandler component — the menu cannot track to a hand.",
                    "Add a SolverHandler to the same GameObject and set its TrackedTargetType to a hand-related option.",
                    nameof(HandMenuHasSolverTarget));
                yield break;
            }

            using (var so = new SerializedObject(handler))
            {
                var trackedType = so.FindProperty("trackedTargetType");
                if (trackedType != null && trackedType.propertyType == SerializedPropertyType.Enum)
                {
                    // Index 0 == None on TrackedObjectType enums in MRTK 3. Anything else is acceptable.
                    if (trackedType.enumValueIndex < 0 || trackedType.enumValueIndex == 0)
                    {
                        yield return new ValidationFinding(
                            "error",
                            $"HandConstraintPalmUp on '{target.gameObject.name}' has SolverHandler.TrackedTargetType set to None.",
                            "Set the SolverHandler's TrackedTargetType to HandJoint or ControllerRay (or another hand source).",
                            nameof(HandMenuHasSolverTarget));
                    }
                }
            }
        }
    }
}
