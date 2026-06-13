#if UNITY_MCP_HAS_XRI
using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.XR;
using UnityEngine.XR.Interaction.Toolkit.Inputs.Simulation;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace UnityMcp.Runtime
{
    /// <summary>
    /// Runtime MonoBehaviour that takes over the MRTK InputSimulator's per-hand
    /// trigger / grip / track / toggle InputActionReferences and feeds device
    /// state through the McpVirtualButtonsDevice. Install swaps the sim's eight
    /// action-refs (left/right × {trigger, grip, track, toggle}) to a dedicated
    /// McpInputActions asset bound exclusively to McpVirtualButtonsDevice; the
    /// originals are snapshotted once per Play Mode session and restored on
    /// uninstall (or on Play Mode exit as defense-in-depth).
    ///
    /// Why this exists: MRTK's InputSimulator.UpdateSimulatedController re-derives
    /// ControllerControls.TriggerAxis/Button/GripAxis/GripButton every frame from
    /// ctrlSettings.TriggerButton.action.IsPressed() and friends. Pushing device
    /// state via InputState.Change loses a per-frame race. Adding extra bindings
    /// alongside the originals still loses to mouse/keyboard input. The only
    /// reliable reversible takeover is replacing the action-ref source itself.
    ///
    /// Pose state continues to flow through reflection-driven UpdateAbsolute on
    /// the simulated controller; head pose is unchanged. Only the button source
    /// is replaced.
    /// </summary>
    [DefaultExecutionOrder(int.MaxValue)] // run after MRTK simulator (and most others)
    public class McpXriDriver : MonoBehaviour
    {
        // ---- Constants ----

        public const string DriverVersion = "1.0.0";

        // Hoisted per architectural-rules/universal/no-magic-numbers-strings.md.
        private const string McpInputActionsResourcePath = "Actions/McpInputActions";
        private const string ActionMapName = "Default";
        private const string ActionLeftTrigger  = "LeftTrigger";
        private const string ActionLeftGrip     = "LeftGrip";
        private const string ActionLeftTrack    = "LeftTrack";
        private const string ActionLeftToggle   = "LeftToggle";
        private const string ActionRightTrigger = "RightTrigger";
        private const string ActionRightGrip    = "RightGrip";
        private const string ActionRightTrack   = "RightTrack";
        private const string ActionRightToggle  = "RightToggle";

        // Reason codes shared with XriDriveInstallTool — duplicated as private
        // const here so the driver can populate BindFailureReason without an
        // Editor->Runtime asmdef dep. Keep in lockstep with the tool's copies.
        public const string ReasonActionReferencePropertyMissing = "action_reference_property_missing";

        // ---- MCP-controlled state (static so tools can write without instance refs) ----

        public static bool HeadActive;
        public static Vector3 HeadPosition = new Vector3(0f, 1.6f, 0f);
        public static Quaternion HeadRotation = Quaternion.identity;

        public static bool LeftHandActive;
        public static Vector3 LeftHandPosition;
        public static Quaternion LeftHandRotation = Quaternion.identity;
        public static float LeftHandTrigger;
        public static float LeftHandGrip;

        public static bool RightHandActive;
        public static Vector3 RightHandPosition;
        public static Quaternion RightHandRotation = Quaternion.identity;
        public static float RightHandTrigger;
        public static float RightHandGrip;

        // ---- Cross-tool diagnostics (read by XriDriveInstallTool) ----

        // Populated when TryBindReflection completes. Cleared on Domain Reload.
        public static string SessionId;
        public static int InstalledAtFrame;

        // Populated when TryBindReflection fails. Read by the install tool to
        // throw structured Details: { reason, missing }.
        public static string BindFailureReason;
        public static List<string> BindFailureMissing;

        // ---- Reflection caches ----

        private MonoBehaviour _mrtkSimulator;
        private FieldInfo _hmdField;            // SimulatedHMD simulatedHMD
        private FieldInfo _leftCtrlField;       // SimulatedController simulatedLeftController
        private FieldInfo _rightCtrlField;      // SimulatedController simulatedRightController
        private FieldInfo _leftSettingsField;   // ControllerSimulationSettings leftControllerSettings
        private FieldInfo _rightSettingsField;  // ControllerSimulationSettings rightControllerSettings
        private PropertyInfo _toggleStateProp;  // ControllerSimulationSettings.ToggleState

        // SimulatedHMD members
        private MethodInfo _hmdChange;          // SimulatedHMD.Change(Vector3, Quaternion)

        // SimulatedController members
        private MethodInfo _ctrlUpdateAbsolute; // SimulatedController.UpdateAbsolute(Pose, ControllerControls, ControllerRotationMode, bool)
        private Type _controllerControlsType;
        private Type _rotationModeType;
        private PropertyInfo _isTrackedProp;
        private PropertyInfo _trackingStateProp;
        private PropertyInfo _triggerAxisProp;
        private PropertyInfo _triggerBtnProp;
        private PropertyInfo _gripAxisProp;
        private PropertyInfo _gripBtnProp;

        // Bootstrap path for hands
        private MethodInfo _enableSimulatedController; // InputSimulator.EnableSimulatedController(Handedness, ControllerSimulationSettings, Vector3)
        private Type _handednessType;

        // Action-ref setters on ControllerSimulationSettings — the four properties
        // we snapshot/swap/restore per hand. Bound in TryBindReflection.
        private PropertyInfo _triggerButtonRefProp;
        private PropertyInfo _gripButtonRefProp;
        private PropertyInfo _trackRefProp;
        private PropertyInfo _toggleRefProp;

        // ---- Virtual device + asset state ----

        private McpVirtualButtonsDevice _virtualButtons;
        private static bool _virtualLayoutRegistered;

        // Cached McpInputActions asset (loaded once per Play Mode session).
        private static InputActionAsset _mcpActionsAsset;

        // ---- Snapshot ----

        // Static so install -> uninstall -> install reuses the first capture and
        // never overwrites it with the already-swapped refs. Domain Reload
        // clears statics (per lessons/unity-domain-reload-in-process.md), which
        // is the only "fresh capture" trigger we want.
        private struct Snapshot
        {
            public bool Captured;
            public InputActionReference LeftTrigger;
            public InputActionReference LeftGrip;
            public InputActionReference LeftTrack;
            public InputActionReference LeftToggle;
            public InputActionReference RightTrigger;
            public InputActionReference RightGrip;
            public InputActionReference RightTrack;
            public InputActionReference RightToggle;
        }
        private static Snapshot _snapshot;

        private bool _reflectionReady;

        // ---- Lifecycle ----

        private void OnEnable()
        {
            EnsureVirtualButtonsRegistered();
            TryBindReflection();
            if (_reflectionReady)
            {
                CaptureSnapshotIfNeeded();
                OverrideSimActionRefs();
            }
#if UNITY_EDITOR
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
#endif
        }

        private void OnDisable()
        {
#if UNITY_EDITOR
            EditorApplication.playModeStateChanged -= OnPlayModeStateChanged;
#endif
            // Restore the sim's original action-refs before anything else; the
            // human user must be able to keep using the dev template after the
            // driver is removed.
            if (_reflectionReady && _snapshot.Captured)
            {
                RestoreSimActionRefs();
            }

            // Best-effort teardown — leave the virtual device registered (cheap)
            // but reset button values so nothing stays "pressed".
            if (_virtualButtons != null)
            {
                var state = new McpVirtualButtonsState();
                InputState.Change(_virtualButtons, state);
            }
        }

#if UNITY_EDITOR
        private void OnPlayModeStateChanged(PlayModeStateChange change)
        {
            // Defense in depth: if anything holds a reference to the sim's
            // ControllerSimulationSettings past Play Mode exit, make sure the
            // snapshotted originals are committed back. Domain Reload also
            // clears _snapshot statics on next Play Mode entry, so a stale
            // pending swap can't survive into a new session.
            if (change == PlayModeStateChange.ExitingPlayMode &&
                _reflectionReady && _snapshot.Captured)
            {
                RestoreSimActionRefs();
            }
        }
#endif

        // ---- Public probes for the install tool ----

        /// <summary>
        /// Idempotently runs reflection bind and returns whether it succeeded.
        /// Called by XriDriveInstallTool after AddComponent so the tool can
        /// surface structured Details on a bind failure synchronously instead
        /// of waiting for the next frame.
        /// </summary>
        public bool TryBindNow()
        {
            if (!_reflectionReady) TryBindReflection();
            return _reflectionReady;
        }

        // ---- Internal bind / install / restore ----

        private static void EnsureVirtualButtonsRegistered()
        {
            if (_virtualLayoutRegistered) return;
            InputSystem.RegisterLayout<McpVirtualButtonsDevice>();
            _virtualLayoutRegistered = true;
        }

        private void CaptureSnapshotIfNeeded()
        {
            if (_snapshot.Captured) return;
            var left  = _leftSettingsField.GetValue(_mrtkSimulator);
            var right = _rightSettingsField.GetValue(_mrtkSimulator);
            if (left == null || right == null) return;

            _snapshot.LeftTrigger   = _triggerButtonRefProp.GetValue(left)  as InputActionReference;
            _snapshot.LeftGrip      = _gripButtonRefProp.GetValue(left)     as InputActionReference;
            _snapshot.LeftTrack     = _trackRefProp.GetValue(left)          as InputActionReference;
            _snapshot.LeftToggle    = _toggleRefProp.GetValue(left)         as InputActionReference;
            _snapshot.RightTrigger  = _triggerButtonRefProp.GetValue(right) as InputActionReference;
            _snapshot.RightGrip     = _gripButtonRefProp.GetValue(right)    as InputActionReference;
            _snapshot.RightTrack    = _trackRefProp.GetValue(right)         as InputActionReference;
            _snapshot.RightToggle   = _toggleRefProp.GetValue(right)        as InputActionReference;
            _snapshot.Captured      = true;

            Debug.Log("[McpXriDriver] snapshot captured (" +
                      $"leftTrigger={_snapshot.LeftTrigger != null}, " +
                      $"leftGrip={_snapshot.LeftGrip != null}, " +
                      $"leftTrack={_snapshot.LeftTrack != null}, " +
                      $"leftToggle={_snapshot.LeftToggle != null}, " +
                      $"rightTrigger={_snapshot.RightTrigger != null}, " +
                      $"rightGrip={_snapshot.RightGrip != null}, " +
                      $"rightTrack={_snapshot.RightTrack != null}, " +
                      $"rightToggle={_snapshot.RightToggle != null})");
        }

        private void OverrideSimActionRefs()
        {
            // Ensure the virtual device exists; PumpVirtualButtons writes to it
            // every frame and the asset's bindings resolve against it.
            if (_virtualButtons == null)
            {
                _virtualButtons = (McpVirtualButtonsDevice)
                    (McpVirtualButtonsDevice.Current
                     ?? InputSystem.AddDevice<McpVirtualButtonsDevice>("McpVirtualButtons"));
            }

            if (_mcpActionsAsset == null)
            {
                _mcpActionsAsset = Resources.Load<InputActionAsset>(McpInputActionsResourcePath);
            }
            if (_mcpActionsAsset == null)
            {
                Debug.LogError("[McpXriDriver] McpInputActions asset not found at Resources/" +
                               McpInputActionsResourcePath +
                               " — install cannot complete. Snapshot retained; uninstall is still safe.");
                return;
            }

            _mcpActionsAsset.Enable();

            var left  = _leftSettingsField.GetValue(_mrtkSimulator);
            var right = _rightSettingsField.GetValue(_mrtkSimulator);
            if (left == null || right == null) return;

            ApplyRef(left,  _triggerButtonRefProp, ActionLeftTrigger);
            ApplyRef(left,  _gripButtonRefProp,    ActionLeftGrip);
            ApplyRef(left,  _trackRefProp,         ActionLeftTrack);
            ApplyRef(left,  _toggleRefProp,        ActionLeftToggle);
            ApplyRef(right, _triggerButtonRefProp, ActionRightTrigger);
            ApplyRef(right, _gripButtonRefProp,    ActionRightGrip);
            ApplyRef(right, _trackRefProp,         ActionRightTrack);
            ApplyRef(right, _toggleRefProp,        ActionRightToggle);
        }

        private void ApplyRef(object settings, PropertyInfo prop, string actionName)
        {
            var map = _mcpActionsAsset.FindActionMap(ActionMapName, throwIfNotFound: false);
            if (map == null) return;
            var action = map.FindAction(actionName);
            if (action == null) return;
            var actionRef = InputActionReference.Create(action);
            prop.SetValue(settings, actionRef);
        }

        private void RestoreSimActionRefs()
        {
            var left  = _leftSettingsField.GetValue(_mrtkSimulator);
            var right = _rightSettingsField.GetValue(_mrtkSimulator);
            if (left == null || right == null) return;

            _triggerButtonRefProp.SetValue(left,  _snapshot.LeftTrigger);
            _gripButtonRefProp.SetValue(left,     _snapshot.LeftGrip);
            _trackRefProp.SetValue(left,          _snapshot.LeftTrack);
            _toggleRefProp.SetValue(left,         _snapshot.LeftToggle);
            _triggerButtonRefProp.SetValue(right, _snapshot.RightTrigger);
            _gripButtonRefProp.SetValue(right,    _snapshot.RightGrip);
            _trackRefProp.SetValue(right,         _snapshot.RightTrack);
            _toggleRefProp.SetValue(right,        _snapshot.RightToggle);

            // Disable the McpInputActions asset so its actions don't stay enabled
            // across uninstall. Snapshot.Captured is retained so a re-install in
            // the same session restores from the same pristine originals.
            if (_mcpActionsAsset != null) _mcpActionsAsset.Disable();
        }

        private void TryBindReflection()
        {
            if (_reflectionReady) return;
            BindFailureMissing = new List<string>();

            // InputSimulator MonoBehaviour
            var simType = Type.GetType(
                "MixedReality.Toolkit.Input.Simulation.InputSimulator, MixedReality.Toolkit.Input"
            ) ?? FindTypeByName("MixedReality.Toolkit.Input.Simulation.InputSimulator");
            if (simType == null) return;

            _mrtkSimulator = (MonoBehaviour)FindFirstObjectByType(simType);
            if (_mrtkSimulator == null) return;

            const BindingFlags Priv = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
            _hmdField           = simType.GetField("simulatedHMD", Priv);
            _leftCtrlField      = simType.GetField("simulatedLeftController", Priv);
            _rightCtrlField     = simType.GetField("simulatedRightController", Priv);
            _leftSettingsField  = simType.GetField("leftControllerSettings", Priv);
            _rightSettingsField = simType.GetField("rightControllerSettings", Priv);

            // SimulatedHMD type
            var simHmdType = FindTypeByName("MixedReality.Toolkit.Input.Simulation.SimulatedHMD");
            if (simHmdType != null)
            {
                _hmdChange = simHmdType.GetMethod("Change", Priv,
                    binder: null,
                    types: new[] { typeof(Vector3), typeof(Quaternion) },
                    modifiers: null);
            }

            // SimulatedController type + UpdateAbsolute
            var simCtrlType = FindTypeByName("MixedReality.Toolkit.Input.Simulation.SimulatedController");
            _controllerControlsType = FindTypeByName("MixedReality.Toolkit.Input.Simulation.ControllerControls");
            _rotationModeType = FindTypeByName("MixedReality.Toolkit.Input.Simulation.ControllerRotationMode");

            if (simCtrlType != null && _controllerControlsType != null && _rotationModeType != null)
            {
                _ctrlUpdateAbsolute = simCtrlType.GetMethod("UpdateAbsolute", Priv,
                    binder: null,
                    types: new[] { typeof(Pose), _controllerControlsType, _rotationModeType, typeof(bool) },
                    modifiers: null);
            }

            if (_controllerControlsType != null)
            {
                _isTrackedProp     = _controllerControlsType.GetProperty("IsTracked", Priv);
                _trackingStateProp = _controllerControlsType.GetProperty("TrackingState", Priv);
                _triggerAxisProp   = _controllerControlsType.GetProperty("TriggerAxis", Priv);
                _triggerBtnProp    = _controllerControlsType.GetProperty("TriggerButton", Priv);
                _gripAxisProp      = _controllerControlsType.GetProperty("GripAxis", Priv);
                _gripBtnProp       = _controllerControlsType.GetProperty("GripButton", Priv);
            }

            // ControllerSimulationSettings.ToggleState — kept for the legacy
            // ApplyLatchedToggle pose path; orthogonal to the action-ref swap.
            var ctrlSettingsType = FindTypeByName("MixedReality.Toolkit.Input.Simulation.ControllerSimulationSettings");
            if (ctrlSettingsType != null)
            {
                _toggleStateProp       = ctrlSettingsType.GetProperty("ToggleState", Priv);
                _triggerButtonRefProp  = ctrlSettingsType.GetProperty("TriggerButton", Priv);
                _gripButtonRefProp     = ctrlSettingsType.GetProperty("GripButton", Priv);
                _trackRefProp          = ctrlSettingsType.GetProperty("Track", Priv);
                _toggleRefProp         = ctrlSettingsType.GetProperty("Toggle", Priv);
            }

            // Bootstrap path: InputSimulator.EnableSimulatedController(Handedness, ctrlSettings, startPos)
            _handednessType = FindTypeByName("MixedReality.Toolkit.Handedness");
            if (ctrlSettingsType != null && _handednessType != null)
            {
                _enableSimulatedController = simType.GetMethod("EnableSimulatedController", Priv,
                    binder: null,
                    types: new[] { _handednessType, ctrlSettingsType, typeof(Vector3) },
                    modifiers: null);
            }

            // Collect missing member names for structured BindFailureMissing.
            if (_hmdField == null)              BindFailureMissing.Add("simulatedHMD");
            if (_leftCtrlField == null)         BindFailureMissing.Add("simulatedLeftController");
            if (_rightCtrlField == null)        BindFailureMissing.Add("simulatedRightController");
            if (_leftSettingsField == null)     BindFailureMissing.Add("leftControllerSettings");
            if (_rightSettingsField == null)    BindFailureMissing.Add("rightControllerSettings");
            if (_hmdChange == null)             BindFailureMissing.Add("SimulatedHMD.Change");
            if (_ctrlUpdateAbsolute == null)    BindFailureMissing.Add("SimulatedController.UpdateAbsolute");
            if (_controllerControlsType == null) BindFailureMissing.Add("ControllerControls");
            if (_rotationModeType == null)      BindFailureMissing.Add("ControllerRotationMode");
            if (_isTrackedProp == null)         BindFailureMissing.Add("ControllerControls.IsTracked");
            if (_trackingStateProp == null)     BindFailureMissing.Add("ControllerControls.TrackingState");
            if (_triggerAxisProp == null)       BindFailureMissing.Add("ControllerControls.TriggerAxis");
            if (_triggerBtnProp == null)        BindFailureMissing.Add("ControllerControls.TriggerButton");
            if (_gripAxisProp == null)          BindFailureMissing.Add("ControllerControls.GripAxis");
            if (_gripBtnProp == null)           BindFailureMissing.Add("ControllerControls.GripButton");
            if (_toggleStateProp == null)       BindFailureMissing.Add("ControllerSimulationSettings.ToggleState");
            if (_triggerButtonRefProp == null)  BindFailureMissing.Add("ControllerSimulationSettings.TriggerButton");
            if (_gripButtonRefProp == null)     BindFailureMissing.Add("ControllerSimulationSettings.GripButton");
            if (_trackRefProp == null)          BindFailureMissing.Add("ControllerSimulationSettings.Track");
            if (_toggleRefProp == null)         BindFailureMissing.Add("ControllerSimulationSettings.Toggle");
            if (_enableSimulatedController == null) BindFailureMissing.Add("InputSimulator.EnableSimulatedController");
            if (_handednessType == null)        BindFailureMissing.Add("MixedReality.Toolkit.Handedness");

            _reflectionReady = BindFailureMissing.Count == 0;

            if (!_reflectionReady)
            {
                BindFailureReason = ReasonActionReferencePropertyMissing;
                Debug.LogWarning("[McpXriDriver] reflection binding incomplete; driver will be a no-op. " +
                                 "MRTK package layout may have changed. Missing: " +
                                 string.Join(", ", BindFailureMissing));
            }
            else
            {
                BindFailureReason = null;
                // Leave BindFailureMissing as an empty list (not null) so
                // defensive readers can iterate without null-check.
                if (SessionId == null)
                {
                    SessionId = Guid.NewGuid().ToString();
                    InstalledAtFrame = Time.frameCount;
                }
                Debug.Log("[McpXriDriver] reflection binding complete; driver active. " +
                          $"trackProp={_trackRefProp != null}, toggleProp={_toggleRefProp != null}, " +
                          $"sessionId={SessionId}, installedAtFrame={InstalledAtFrame}");
            }
        }

        // ---- Per-frame pump ----

        // Run both in Update (post-sim via execution order) and LateUpdate so the
        // XRI interactors see our values whether they poll in Update or LateUpdate.
        private void Update() => Pump();
        private void LateUpdate() => Pump();

        private void Pump()
        {
            if (!_reflectionReady) { TryBindReflection(); return; }

            // Keep hand latched so MRTK's Update re-creates the device every frame
            // when the agent has "activated" that hand.
            ApplyLatchedToggle(_leftSettingsField, LeftHandActive);
            ApplyLatchedToggle(_rightSettingsField, RightHandActive);

            // Push HMD
            if (HeadActive)
            {
                var sim = _hmdField.GetValue(_mrtkSimulator);
                if (sim != null)
                {
                    _hmdChange.Invoke(sim, new object[] { HeadPosition, HeadRotation });
                }
            }

            // Bootstrap missing controllers if the agent has activated them
            BootstrapControllerIfMissing(_leftCtrlField, _leftSettingsField, LeftHandActive, LeftHandPosition, "Left");
            BootstrapControllerIfMissing(_rightCtrlField, _rightSettingsField, RightHandActive, RightHandPosition, "Right");

            // Push controllers
            PushController(_leftCtrlField, LeftHandActive, LeftHandPosition, LeftHandRotation,
                           LeftHandTrigger, LeftHandGrip);
            PushController(_rightCtrlField, RightHandActive, RightHandPosition, RightHandRotation,
                           RightHandTrigger, RightHandGrip);

            // Push virtual button state — this is the source MRTK's
            // trigger/grip actions resolve from after install swapped the refs.
            PumpVirtualButtons();
        }

        private void PumpVirtualButtons()
        {
            if (_virtualButtons == null) return;
            var state = new McpVirtualButtonsState
            {
                leftTrigger  = LeftHandActive  ? Mathf.Clamp01(LeftHandTrigger)  : 0f,
                leftGrip     = LeftHandActive  ? Mathf.Clamp01(LeftHandGrip)     : 0f,
                rightTrigger = RightHandActive ? Mathf.Clamp01(RightHandTrigger) : 0f,
                rightGrip    = RightHandActive ? Mathf.Clamp01(RightHandGrip)    : 0f,
            };
            InputState.Change(_virtualButtons, state);
        }

        private void BootstrapControllerIfMissing(FieldInfo simCtrlField, FieldInfo settingsField,
                                                  bool active, Vector3 worldPos, string handedNessName)
        {
            if (!active) return;
            if (simCtrlField.GetValue(_mrtkSimulator) != null) return; // already exists
            var settings = settingsField.GetValue(_mrtkSimulator);
            if (settings == null) return;

            // Convert world-space position into camera-relative for the
            // simulator's start-pose convention (matches what MRTK does in its
            // own bootstrap path).
            var cam = Camera.main;
            Vector3 startPos = cam != null
                ? cam.transform.InverseTransformPoint(worldPos)
                : Vector3.forward * 0.4f;

            var handednessValue = Enum.Parse(_handednessType, handedNessName);
            var created = _enableSimulatedController.Invoke(_mrtkSimulator,
                new object[] { handednessValue, settings, startPos });

            if (created == null)
            {
                Debug.LogWarning($"[McpXriDriver] failed to bootstrap {handedNessName} simulated controller.");
                return;
            }

            // The simulator's own bootstrap path assigns the result to the
            // private field via `ref` semantics; reflection invoke can't carry
            // that. Mirror the assignment here so we don't re-bootstrap each
            // frame and leak SimulatedController instances.
            simCtrlField.SetValue(_mrtkSimulator, created);
        }

        private void ApplyLatchedToggle(FieldInfo settingsField, bool active)
        {
            var settings = settingsField.GetValue(_mrtkSimulator);
            if (settings == null) return;
            _toggleStateProp.SetValue(settings, active);
        }

        private void PushController(FieldInfo simCtrlField, bool active, Vector3 pos, Quaternion rot,
                                    float trigger, float grip)
        {
            if (!active) return;
            var sim = simCtrlField.GetValue(_mrtkSimulator);
            if (sim == null) return;

            // Build a ControllerControls instance and stamp our state into it.
            var controls = Activator.CreateInstance(_controllerControlsType);
            _isTrackedProp.SetValue(controls, true);
            _trackingStateProp.SetValue(controls, InputTrackingState.Position | InputTrackingState.Rotation);
            _triggerAxisProp.SetValue(controls, Mathf.Clamp01(trigger));
            _triggerBtnProp.SetValue(controls, trigger >= 0.5f);
            _gripAxisProp.SetValue(controls, Mathf.Clamp01(grip));
            _gripBtnProp.SetValue(controls, grip >= 0.5f);

            // ControllerRotationMode.UserControl == 2 (Disabled=0, FaceCamera=1, UserControl=2, CameraAligned=3).
            // Use enum.ToObject so we don't depend on the layout.
            var rotMode = Enum.ToObject(_rotationModeType,
                Enum.Parse(_rotationModeType, "UserControl"));

            _ctrlUpdateAbsolute.Invoke(sim, new object[] {
                new Pose(pos, rot),
                controls,
                rotMode,
                false /* shouldUseRayVector */
            });
            // Trigger/grip propagate via the virtual device pump (PumpVirtualButtons),
            // not via direct device-state writes — those lose the race against
            // the simulator's per-frame ApplyState rewrite.
        }

        private static Type FindTypeByName(string fullName)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var t = asm.GetType(fullName, throwOnError: false);
                    if (t != null) return t;
                }
                catch { /* skip unloadable */ }
            }
            return null;
        }

        private static UnityEngine.Object FindFirstObjectByType(Type type)
        {
            // Unity 6+ replaces FindObjectOfType with FindFirstObjectByType; the
            // generic overload doesn't accept runtime Type, so use the public
            // non-generic Object.FindFirstObjectByType(Type) introduced in 2022.2.
            return UnityEngine.Object.FindFirstObjectByType(type);
        }
    }
}
#endif
