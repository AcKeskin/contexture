using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when a HandConstraintPalmUp has facingThreshold or palmFlatThreshold set
    /// to extreme values that effectively disable activation. Catches misconfigured
    /// menus that "never appear" without obvious cause.
    /// </summary>
    internal sealed class HandMenuPalmUpThresholdsSane : IComponentValidationRule
    {
        public string AppliesTo => "HandConstraintPalmUp";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                var facing = so.FindProperty("facingCameraTrackingThreshold");
                if (facing != null && facing.propertyType == SerializedPropertyType.Float)
                {
                    if (facing.floatValue >= 90f)
                    {
                        yield return new ValidationFinding(
                            "warning",
                            $"HandConstraintPalmUp on '{target.gameObject.name}' has facingCameraTrackingThreshold ≥ 90° — menu activates at any hand angle.",
                            "Typical values are 30°-60°. Higher values make the menu appear in unintended poses.",
                            nameof(HandMenuPalmUpThresholdsSane));
                    }
                    else if (facing.floatValue <= 0f)
                    {
                        yield return new ValidationFinding(
                            "warning",
                            $"HandConstraintPalmUp on '{target.gameObject.name}' has facingCameraTrackingThreshold ≤ 0° — menu never activates.",
                            "Set a positive threshold (typical: 45°).",
                            nameof(HandMenuPalmUpThresholdsSane));
                    }
                }
            }
        }
    }
}
