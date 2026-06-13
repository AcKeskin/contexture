using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when a PressableButton's OnClicked event has zero persistent listeners.
    /// A button with no click handler is almost always a bug.
    /// </summary>
    internal sealed class ButtonHasClickHandler : IComponentValidationRule
    {
        public string AppliesTo => "PressableButton";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                // MRTK 3 PressableButton exposes an OnClicked UnityEvent; the persistent-listener
                // count lives at OnClicked.m_PersistentCalls.m_Calls.Array.size.
                var p = so.FindProperty("OnClicked.m_PersistentCalls.m_Calls");
                if (p == null || !p.isArray)
                {
                    // Older MRTK fields; nothing to assert.
                    yield break;
                }
                if (p.arraySize == 0)
                {
                    yield return new ValidationFinding(
                        "warning",
                        $"PressableButton on '{target.gameObject.name}' has zero persistent OnClicked listeners.",
                        "Wire an OnClicked listener in the Inspector, or add one at runtime via PressableButton.OnClicked.AddListener.",
                        nameof(ButtonHasClickHandler));
                }
            }
        }
    }
}
