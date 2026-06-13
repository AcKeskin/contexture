// XRI is an optional dependency of unity-mcp (see Editor/UnityMcp.Editor.asmdef
// versionDefines). On installs without com.unity.xr.interaction.toolkit, the
// XRBaseInteractor type cannot resolve and this rule's compile fails. Gate the
// whole file — MRTK 3's SolverHandler only exists when MRTK is present, and
// MRTK requires XRI, so an XRI-free install has nothing this rule could find.
#if UNITY_MCP_HAS_XRI
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit.Interactors;

namespace UnityMcp.Editor.Tools.Validation
{
    /// <summary>
    /// Warns when an MRTK 3 SolverHandler is set to track an interactor-driven
    /// target (Interactor / ControllerRay / HandJoint) but no enabled
    /// XRBaseInteractor exists in any loaded scene. Catches the "menu never
    /// appears" failure mode where the rig is missing or all interactors are
    /// disabled.
    ///
    /// The TrackedObjectType enum values that need an interactor were derived
    /// by reading SolverHandler.cs's switch in MRTK 3 source. The plan's
    /// original allowlist included MotionController and Hand, but those values
    /// don't exist in the actual TrackedObjectType enum (the enum has only
    /// Head / Interactor (= ControllerRay) / HandJoint / CustomOverride). The
    /// allowlist below reflects the real enum.
    /// </summary>
    internal sealed class SolverHandlerHasInteractor : IComponentValidationRule
    {
        private static readonly string[] _interactorRequiringTypes =
        {
            "Interactor",     // generic XRI interactor-driven target
            "ControllerRay",  // legacy alias for Interactor (same int value)
            "HandJoint",      // hand-joint-tracked target
        };

        public string AppliesTo => "SolverHandler";

        public IEnumerable<ValidationFinding> Apply(Component target)
        {
            if (target == null) yield break;

            using (var so = new SerializedObject(target))
            {
                var prop = so.FindProperty("trackedTargetType");
                if (prop == null || prop.propertyType != SerializedPropertyType.Enum)
                {
                    Debug.LogWarning($"[UnityMCP] SolverHandlerHasInteractor could not read trackedTargetType on {target.GetType().Name} — MRTK API change?");
                    yield break;
                }

                var resolvedName = prop.enumValueIndex >= 0 && prop.enumValueIndex < prop.enumNames.Length
                    ? prop.enumNames[prop.enumValueIndex]
                    : null;
                if (string.IsNullOrEmpty(resolvedName)) yield break;

                bool needsInteractor = false;
                foreach (var t in _interactorRequiringTypes)
                {
                    if (resolvedName == t) { needsInteractor = true; break; }
                }
                if (!needsInteractor) yield break;

                var interactors = Object.FindObjectsByType<XRBaseInteractor>(FindObjectsSortMode.None);
                if (interactors == null || interactors.Length == 0)
                {
                    yield return new ValidationFinding(
                        "warning",
                        $"SolverHandler on '{target.gameObject.name}' has TrackedTargetType={resolvedName} (requires an interactor), but no enabled XRBaseInteractor is present in any loaded scene.",
                        "Drop an XR Origin / XR Rig with an interactor into the scene, or change TrackedTargetType to a value that doesn't need one (e.g. Head / CustomOverride).",
                        nameof(SolverHandlerHasInteractor));
                }
            }
        }
    }
}
#endif
