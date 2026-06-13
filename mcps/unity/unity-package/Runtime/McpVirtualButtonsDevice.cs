#if UNITY_MCP_HAS_INPUT_SYSTEM
using System.Runtime.InteropServices;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Layouts;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.Scripting;

namespace UnityMcp.Runtime
{
    /// <summary>
    /// State backing McpVirtualButtonsDevice — four button axes (0..1) sharing one
    /// 16-byte layout. Lets the driver feed trigger/grip values into the
    /// InputSystem so MRTK's per-frame InputAction reads pick them up cleanly,
    /// instead of fighting the simulator's writes via InputState.Change races.
    /// </summary>
    [StructLayout(LayoutKind.Explicit, Size = 16)]
    public struct McpVirtualButtonsState : IInputStateTypeInfo
    {
        public static FourCC formatId => new FourCC('M', 'V', 'B', 'S');
        public FourCC format => formatId;

        [InputControl(name = "leftTrigger",  layout = "Axis", offset = 0)]
        [FieldOffset(0)] public float leftTrigger;

        [InputControl(name = "leftGrip",     layout = "Axis", offset = 4)]
        [FieldOffset(4)] public float leftGrip;

        [InputControl(name = "rightTrigger", layout = "Axis", offset = 8)]
        [FieldOffset(8)] public float rightTrigger;

        [InputControl(name = "rightGrip",    layout = "Axis", offset = 12)]
        [FieldOffset(12)] public float rightGrip;
    }

    /// <summary>
    /// Virtual InputDevice the McpXriDriver pushes state into so MRTK's
    /// simulator-bound trigger/grip InputActions resolve cleanly from MCP-driven
    /// values. Bindings are added programmatically at driver install time:
    /// <c>&lt;McpVirtualButtons&gt;/rightTrigger</c> etc.
    ///
    /// Layout uses AxisControls so existing button bindings (which read as
    /// button-pressed when value &gt; defaultButtonPressPoint) work without a
    /// custom press-point. The driver writes 0 or 1.
    /// </summary>
    [InputControlLayout(stateType = typeof(McpVirtualButtonsState), displayName = "MCP Virtual Buttons"), Preserve]
    public class McpVirtualButtonsDevice : InputDevice
    {
        public AxisControl LeftTrigger  { get; private set; }
        public AxisControl LeftGrip     { get; private set; }
        public AxisControl RightTrigger { get; private set; }
        public AxisControl RightGrip    { get; private set; }

        public static McpVirtualButtonsDevice Current { get; private set; }

        protected override void FinishSetup()
        {
            base.FinishSetup();
            LeftTrigger  = GetChildControl<AxisControl>("leftTrigger");
            LeftGrip     = GetChildControl<AxisControl>("leftGrip");
            RightTrigger = GetChildControl<AxisControl>("rightTrigger");
            RightGrip    = GetChildControl<AxisControl>("rightGrip");
        }

        public override void MakeCurrent()
        {
            base.MakeCurrent();
            Current = this;
        }

        protected override void OnRemoved()
        {
            base.OnRemoved();
            if (Current == this) Current = null;
        }
    }
}
#endif
