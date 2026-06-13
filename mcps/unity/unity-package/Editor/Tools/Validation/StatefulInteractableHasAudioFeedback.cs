using System.Collections.Generic;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when any StatefulInteractable subclass (PressableButton, Slider,
    /// Toggle, user-authored types …) has no AudioSource on the same
    /// GameObject or any direct child. Audio feedback confirms activation in
    /// MR contexts where visual feedback alone often isn't enough.
    ///
    /// Replaces the previous PressableButton-only ButtonHasAudioFeedback rule
    /// — the dispatcher's type-chain walk fires this rule for every subclass
    /// of StatefulInteractable, so PressableButton coverage is preserved
    /// while custom subclasses inherit the check.
    /// </summary>
    internal sealed class StatefulInteractableHasAudioFeedback : IComponentValidationRule
    {
        public string AppliesTo => "StatefulInteractable";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            var go = target.gameObject;
            var audio = go.GetComponentInChildren<AudioSource>(includeInactive: true);
            if (audio == null)
            {
                yield return new ValidationFinding(
                    "warning",
                    $"{target.GetType().Name} on '{go.name}' has no AudioSource on itself or any child — users get no audio feedback on activation.",
                    "Add an AudioSource component (often via the StateVisualizer's interaction sound) to the interactable or any child GameObject.",
                    nameof(StatefulInteractableHasAudioFeedback));
            }
        }
    }
}
