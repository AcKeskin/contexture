using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when an MRTK 3 ToggleCollection has fewer than 2 toggles wired
    /// in. Mutually-exclusive selection across 0 or 1 toggles is meaningless —
    /// usually a sign the author forgot to drag the StatefulInteractable
    /// children into the Toggles list, or the list got reset by a prefab
    /// override.
    /// </summary>
    internal sealed class ToggleCollectionHasToggles : IComponentValidationRule
    {
        public string AppliesTo => "ToggleCollection";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                var toggles = so.FindProperty("toggles");
                if (toggles == null || !toggles.isArray)
                {
                    Debug.LogWarning($"[UnityMCP] ToggleCollectionHasToggles could not read toggles list on {target.GetType().Name} — MRTK API change?");
                    yield break;
                }

                if (toggles.arraySize < 2)
                {
                    yield return new ValidationFinding(
                        "warning",
                        $"ToggleCollection on '{target.gameObject.name}' has {toggles.arraySize} toggle(s) wired in — needs at least 2 for mutually-exclusive selection to be meaningful.",
                        "Drag your StatefulInteractable toggle children into the ToggleCollection's Toggles list (or call AddToggle at runtime).",
                        nameof(ToggleCollectionHasToggles));
                }
            }
        }
    }
}
