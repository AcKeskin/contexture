using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Runtime;
#if UNITY_MCP_HAS_XRI
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.InputSystem.Utilities;
using UnityEngine.XR;
using UnityEngine.XR.Interaction.Toolkit.Inputs.Simulation;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Direct device-state injection for the XRI simulated devices that back the
    /// MRTK / XRI input simulator (XRSimulatedHMD, XRSimulatedController). Bypasses
    /// the simulator's per-frame integration and writes the device pose so the
    /// rig's Tracked Pose Drivers pick it up next sample.
    ///
    /// Why this exists alongside xri_simulate_pose: that tool writes Transform.position
    /// on the rig hierarchy, but Tracked Pose Drivers overwrite the camera transform
    /// from the SimulatedHMD device every frame — so writes never stick once the
    /// simulator is running. This tool writes the device state instead, which is the
    /// supported "drive the simulator" path.
    ///
    /// device:
    ///   head      → XRSimulatedHMD          (always present once the simulator runs)
    ///   leftHand  → XRSimulatedController with usage "LeftHand"  (only present when
    ///                                                            the hand is enabled)
    ///   rightHand → XRSimulatedController with usage "RightHand" (same caveat)
    ///
    /// For hands: enable the hand first via input_inject {action:'key', key:'T' or 'Y'}
    /// (MRTK's default Toggle bindings) and let one frame pass before injecting pose.
    /// </summary>
    [UnityMcpTool("xri_inject_device", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriInjectDeviceTool : IUnityMcpTool
    {
        public string Name => "xri_inject_device";

        public string Description =>
            "Push pose + tracking state into an XRI simulated device (Play Mode only). " +
            "device='head'|'leftHand'|'rightHand'. " +
            "Optional 'position' [x,y,z] (world-space pose written to devicePosition + " +
            "centerEyePosition for HMD). Optional 'rotation' [x,y,z] Euler or [x,y,z,w] " +
            "quaternion. Optional 'isTracked' bool (default true). For controllers, " +
            "optional 'trigger' (0..1) and 'grip' (0..1). Returns the resulting device " +
            "state. Throws NotFound when the requested device isn't registered (hands " +
            "must be enabled via the simulator's Toggle action first).";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["device"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "head", "leftHand", "rightHand" },
                },
                ["position"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 3,
                },
                ["rotation"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 4,
                    ["description"] = "Euler [x,y,z] or quaternion [x,y,z,w].",
                },
                ["isTracked"] = new JObject { ["type"] = "boolean" },
                ["trigger"]   = new JObject { ["type"] = "number", ["minimum"] = 0, ["maximum"] = 1 },
                ["grip"]      = new JObject { ["type"] = "number", ["minimum"] = 0, ["maximum"] = 1 },
            },
            ["required"] = new JArray { "device" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            if (!Application.isPlaying)
            {
                throw new ToolException("InvalidInput",
                    "xri_inject_device requires play mode. Call playmode_set { state: 'play' } first.");
            }

            var device = @params.Value<string>("device");
            if (string.IsNullOrWhiteSpace(device))
            {
                throw new ToolException("InvalidInput", "'device' is required.");
            }

            switch (device)
            {
                case "head":      return Task.FromResult(InjectHmd(@params));
                case "leftHand":  return Task.FromResult(InjectController(@params, UnityEngine.InputSystem.CommonUsages.LeftHand, "leftHand"));
                case "rightHand": return Task.FromResult(InjectController(@params, UnityEngine.InputSystem.CommonUsages.RightHand, "rightHand"));
                default:
                    throw new ToolException("InvalidInput",
                        $"'device' must be head|leftHand|rightHand; got '{device}'.");
            }
        }

        private static Quaternion? ParseRotation(JObject @params)
        {
            var rot = @params["rotation"] as JArray;
            if (rot == null) return null;
            if (rot.Count == 4)
            {
                return new Quaternion(
                    rot[0].Value<float>(), rot[1].Value<float>(),
                    rot[2].Value<float>(), rot[3].Value<float>());
            }
            if (rot.Count == 3)
            {
                return Quaternion.Euler(
                    rot[0].Value<float>(), rot[1].Value<float>(), rot[2].Value<float>());
            }
            throw new ToolException("InvalidInput",
                "'rotation' must be length 3 (Euler) or 4 (quaternion).");
        }

        private static ToolResult InjectHmd(JObject @params)
        {
            // Prefer the McpXriDriver path when installed — it keeps writes alive
            // across frames by re-applying in LateUpdate. Without it, our writes
            // get overwritten by MRTK's simulator next frame.
            if (McpXriDriver.HeadActive || HasDriver())
            {
                var posDrv = Vector3Json.TryParse(@params["position"] as JArray);
                var rotDrv = ParseRotation(@params);
                if (posDrv.HasValue) McpXriDriver.HeadPosition = posDrv.Value;
                if (rotDrv.HasValue) McpXriDriver.HeadRotation = rotDrv.Value;
                McpXriDriver.HeadActive = @params["isTracked"]?.Value<bool>() ?? true;

                return ToolResult.Json(new JObject
                {
                    ["device"] = "head",
                    ["isPlaying"] = true,
                    ["driver"] = "McpXriDriver",
                    ["isTracked"] = McpXriDriver.HeadActive,
                    ["position"] = Vector3Json.ToJson(McpXriDriver.HeadPosition),
                    ["rotation"] = Vector3Json.ToJson(McpXriDriver.HeadRotation),
                });
            }

            XRSimulatedHMD hmd = null;
            foreach (var d in InputSystem.devices)
            {
                if (d is XRSimulatedHMD candidate)
                {
                    hmd = candidate;
                    break;
                }
            }
            // Auto-register when the simulator hasn't created one. Subsequent
            // calls reuse the same device. Without the driver, the write only
            // survives one frame against MRTK's simulator.
            if (hmd == null)
            {
                hmd = InputSystem.AddDevice<XRSimulatedHMD>();
                if (hmd == null)
                {
                    throw new ToolException("ToolError",
                        "InputSystem.AddDevice<XRSimulatedHMD> returned null.");
                }
            }

            var state = new XRSimulatedHMDState();
            state.Reset();

            bool isTracked = @params["isTracked"]?.Value<bool>() ?? true;
            state.isTracked = isTracked;
            state.trackingState = (int)(InputTrackingState.Position | InputTrackingState.Rotation);

            var pos = Vector3Json.TryParse(@params["position"] as JArray);
            if (pos.HasValue)
            {
                state.devicePosition = pos.Value;
                state.centerEyePosition = pos.Value;
                state.leftEyePosition = pos.Value;
                state.rightEyePosition = pos.Value;
            }

            var rot = ParseRotation(@params);
            if (rot.HasValue)
            {
                state.deviceRotation = rot.Value;
                state.centerEyeRotation = rot.Value;
                state.leftEyeRotation = rot.Value;
                state.rightEyeRotation = rot.Value;
            }

            InputState.Change(hmd, state);

            return ToolResult.Json(new JObject
            {
                ["device"] = "head",
                ["isPlaying"] = true,
                ["devicePath"] = hmd.path,
                ["isTracked"] = state.isTracked,
                ["position"] = Vector3Json.ToJson(state.devicePosition),
                ["rotation"] = Vector3Json.ToJson(state.deviceRotation),
            });
        }

        private static ToolResult InjectController(JObject @params, InternedString usage, string deviceLabel)
        {
            // McpXriDriver path: write to static fields, driver re-applies in LateUpdate.
            if (HasDriver())
            {
                var posDrv = Vector3Json.TryParse(@params["position"] as JArray);
                var rotDrv = ParseRotation(@params);
                var trgDrv = @params["trigger"]?.Value<float?>();
                var grpDrv = @params["grip"]?.Value<float?>();
                bool isLeft = deviceLabel == "leftHand";

                if (posDrv.HasValue) { if (isLeft) McpXriDriver.LeftHandPosition = posDrv.Value; else McpXriDriver.RightHandPosition = posDrv.Value; }
                if (rotDrv.HasValue) { if (isLeft) McpXriDriver.LeftHandRotation = rotDrv.Value; else McpXriDriver.RightHandRotation = rotDrv.Value; }
                if (trgDrv.HasValue) { if (isLeft) McpXriDriver.LeftHandTrigger  = Mathf.Clamp01(trgDrv.Value); else McpXriDriver.RightHandTrigger = Mathf.Clamp01(trgDrv.Value); }
                if (grpDrv.HasValue) { if (isLeft) McpXriDriver.LeftHandGrip     = Mathf.Clamp01(grpDrv.Value); else McpXriDriver.RightHandGrip    = Mathf.Clamp01(grpDrv.Value); }

                bool active = @params["isTracked"]?.Value<bool>() ?? true;
                if (isLeft) McpXriDriver.LeftHandActive = active; else McpXriDriver.RightHandActive = active;

                return ToolResult.Json(new JObject
                {
                    ["device"] = deviceLabel,
                    ["isPlaying"] = true,
                    ["driver"] = "McpXriDriver",
                    ["isTracked"] = active,
                    ["position"] = Vector3Json.ToJson(isLeft ? McpXriDriver.LeftHandPosition : McpXriDriver.RightHandPosition),
                    ["rotation"] = Vector3Json.ToJson(isLeft ? McpXriDriver.LeftHandRotation : McpXriDriver.RightHandRotation),
                    ["trigger"] = isLeft ? McpXriDriver.LeftHandTrigger : McpXriDriver.RightHandTrigger,
                    ["grip"]    = isLeft ? McpXriDriver.LeftHandGrip    : McpXriDriver.RightHandGrip,
                });
            }

            XRSimulatedController controller = null;
            foreach (var d in InputSystem.devices)
            {
                if (d is XRSimulatedController candidate && HasUsage(candidate, usage))
                {
                    controller = candidate;
                    break;
                }
            }
            // Auto-register the controller with the requested handedness usage if
            // the simulator hasn't created one (suppressed or never toggled on).
            // The same device persists across calls.
            if (controller == null)
            {
                controller = InputSystem.AddDevice<XRSimulatedController>();
                if (controller == null)
                {
                    throw new ToolException("ToolError",
                        $"InputSystem.AddDevice<XRSimulatedController> returned null (usage '{usage}').");
                }
                InputSystem.SetDeviceUsage(controller, usage);
            }

            var state = new XRSimulatedControllerState();
            state.Reset();

            bool isTracked = @params["isTracked"]?.Value<bool>() ?? true;
            state.isTracked = isTracked;
            state.trackingState = (int)(InputTrackingState.Position | InputTrackingState.Rotation);

            var pos = Vector3Json.TryParse(@params["position"] as JArray);
            if (pos.HasValue) state.devicePosition = pos.Value;

            var rot = ParseRotation(@params);
            if (rot.HasValue) state.deviceRotation = rot.Value;

            var trigger = @params["trigger"]?.Value<float?>();
            if (trigger.HasValue)
            {
                state.trigger = Mathf.Clamp01(trigger.Value);
                state = state.WithButton(ControllerButton.TriggerButton, state.trigger > 0.5f);
            }
            var grip = @params["grip"]?.Value<float?>();
            if (grip.HasValue)
            {
                state.grip = Mathf.Clamp01(grip.Value);
                state = state.WithButton(ControllerButton.GripButton, state.grip > 0.5f);
            }

            InputState.Change(controller, state);

            return ToolResult.Json(new JObject
            {
                ["device"] = deviceLabel,
                ["isPlaying"] = true,
                ["devicePath"] = controller.path,
                ["isTracked"] = state.isTracked,
                ["position"] = Vector3Json.ToJson(state.devicePosition),
                ["rotation"] = Vector3Json.ToJson(state.deviceRotation),
                ["trigger"] = state.trigger,
                ["grip"] = state.grip,
            });
        }

        private static bool HasUsage(UnityEngine.InputSystem.InputDevice device, InternedString usage)
        {
            foreach (var u in device.usages)
            {
                if (u == usage) return true;
            }
            return false;
        }

        private static bool HasDriver()
        {
            // O(scene) but cheap; caches not worth the invalidation surface.
            return Object.FindFirstObjectByType<McpXriDriver>() != null;
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_inject_device requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
