using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when a Canvas in WorldSpace render mode has any axis of
    /// transform.localScale outside the [0.0009, 0.0011] tolerance band
    /// around the MRTK convention of 0.001. World-space Canvas at scale=1
    /// renders at literally-meters-per-unit, which makes hand-readable text
    /// the size of a building. The rule applies to ANY worldSpace Canvas
    /// (not just MRTK-content-bearing ones) — the convention is universal
    /// to MR/VR Unity UI; MRTK just happens to surface the failure mode.
    /// </summary>
    internal sealed class CanvasUsesWorldSpaceScale : IComponentValidationRule
    {
        private const float MrtkConvention = 0.001f;
        private const float Tolerance = 0.0001f;

        public string AppliesTo => "Canvas";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;
            if (!(target is Canvas canvas)) yield break;
            if (canvas.renderMode != RenderMode.WorldSpace) yield break;

            var s = canvas.transform.localScale;
            if (!IsConventional(s.x) || !IsConventional(s.y) || !IsConventional(s.z))
            {
                yield return new ValidationFinding(
                    "warning",
                    $"Canvas on '{canvas.gameObject.name}' is in worldSpace render mode but its scale is ({s.x}, {s.y}, {s.z}) — MRTK convention is (0.001, 0.001, 0.001) for hand-readable text and physical sizing.",
                    "Set the Canvas's transform.localScale to (0.001, 0.001, 0.001). Adjust child RectTransform sizes in millimetres to compensate.",
                    nameof(CanvasUsesWorldSpaceScale));
            }
        }

        private static bool IsConventional(float axis)
        {
            return axis >= MrtkConvention - Tolerance && axis <= MrtkConvention + Tolerance;
        }
    }
}
