using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when an MRTK 3 Slider's MinValue equals MaxValue. An empty range
    /// makes the slider functionally unusable — the user can't represent any
    /// state change, and NormalizedValue divides by zero (the source guards
    /// against this but the slider is silently inert). Catches authoring
    /// mistakes like leaving both at the default 0/1 and forgetting one.
    /// </summary>
    internal sealed class SliderHasValueRange : IComponentValidationRule
    {
        public string AppliesTo => "Slider";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                var min = so.FindProperty("minValue");
                var max = so.FindProperty("maxValue");
                if (min == null || max == null
                    || min.propertyType != SerializedPropertyType.Float
                    || max.propertyType != SerializedPropertyType.Float)
                {
                    Debug.LogWarning($"[UnityMCP] SliderHasValueRange could not read minValue/maxValue on {target.GetType().Name} — MRTK API change?");
                    yield break;
                }

                if (Mathf.Approximately(min.floatValue, max.floatValue))
                {
                    yield return new ValidationFinding(
                        "warning",
                        $"Slider on '{target.gameObject.name}' has MinValue == MaxValue ({min.floatValue}) — the slider has no usable range and cannot represent any state change.",
                        "Set MinValue and MaxValue to the inclusive bounds of the value range you want the user to slide through.",
                        nameof(SliderHasValueRange));
                }
            }
        }
    }
}
