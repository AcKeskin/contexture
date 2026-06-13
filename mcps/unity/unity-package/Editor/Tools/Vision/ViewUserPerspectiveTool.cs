using System;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_XRI
using Unity.XR.CoreUtils;
#endif

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// "What the user sees right now" — captures from the XR Interaction Simulator's
    /// head pose AND returns a JSON sidecar describing simulator state (controllers
    /// visible, hand tracking on, all three pose snapshots). One round-trip, full
    /// context for the agent.
    ///
    /// Wire shape: returns application/json with both the base64 PNG and the sidecar
    /// fields. Step 24+ will translate this into a multi-content MCP message
    /// (PNG block + text block) when the wire envelope grows multi-content support.
    /// </summary>
    [UnityMcpTool("view_user_perspective", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class ViewUserPerspectiveTool : IUnityMcpTool
    {
        public string Name => "view_user_perspective";

        public string Description =>
            "Capture from the XR Interaction Simulator's head pose plus a JSON sidecar " +
            "describing simulator state (head/leftHand/rightHand poses, controllers " +
            "visible, hand tracking on). Returns application/json with { pngBase64, " +
            "sidecar }. Errors when no XROrigin is loaded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["fov"] = new JObject { ["type"] = "number", ["minimum"] = 1, ["maximum"] = 179, ["default"] = 60 },
                ["width"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 1280 },
                ["height"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 720 },
            },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            float fov = @params["fov"]?.Value<float>() ?? 60f;
            int width = Mathf.Clamp(@params["width"]?.Value<int>() ?? 1280, 16, 4096);
            int height = Mathf.Clamp(@params["height"]?.Value<int>() ?? 720, 16, 4096);

            var origin = UnityMcp.Editor.Tools.XRI.XrRigLookup.FindActive();
            if (origin == null || origin.Camera == null)
            {
                throw new ToolException("InvalidInput",
                    "No active XROrigin with a Camera found in any loaded scene.");
            }

            var headT = origin.Camera.transform;
            byte[] png = ViewSceneFromTool.CaptureFrom(
                headT.position,
                lookAtArr: null,
                rotArr: new JArray(headT.rotation.x, headT.rotation.y, headT.rotation.z, headT.rotation.w),
                fov,
                width,
                height);

            var sidecar = BuildSidecar(origin);

            var data = new JObject
            {
                ["pngBase64"] = Convert.ToBase64String(png),
                ["pngBytes"] = png.Length,
                ["sidecar"] = sidecar,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static JObject BuildSidecar(XROrigin origin)
        {
            // Head pose — straight from the rig's camera.
            var headT = origin.Camera.transform;
            var head = new JObject
            {
                ["position"] = Vector3Json.ToJson(headT.position),
                ["rotation"] = Vector3Json.ToJson(headT.rotation),
            };

            // Hand poses — match by name fragment, same heuristic as XriSimulatePoseTool.
            var leftHand = FindHandPose(origin, "Left");
            var rightHand = FindHandPose(origin, "Right");

            // Hand tracking on/off — proxy: any active component named XRHandTrackingEvents
            // or anything starting with "XRHand". Heuristic — XRI version drift makes
            // this best-effort.
            bool handTrackingOn = origin.GetComponentsInChildren<MonoBehaviour>(true)
                .Any(m => m != null && m.GetType().Name.StartsWith("XRHand", StringComparison.Ordinal));

            // Controllers visible — proxy: any active interactor whose name contains "Controller".
            bool controllersVisible = origin
                .GetComponentsInChildren<MonoBehaviour>(true)
                .Any(m => m != null && m.enabled
                    && (m.name.IndexOf("Controller", StringComparison.OrdinalIgnoreCase) >= 0));

            return new JObject
            {
                ["controllersVisible"] = controllersVisible,
                ["handTrackingOn"] = handTrackingOn,
                ["headPose"] = head,
                ["leftHandPose"] = leftHand,
                ["rightHandPose"] = rightHand,
            };
        }

        private static JToken FindHandPose(XROrigin origin, string match)
        {
            var hand = UnityMcp.Editor.Tools.XRI.XrRigLookup.FindHandTransform(origin, match);
            if (hand == null) return JValue.CreateNull();
            return new JObject
            {
                ["position"] = Vector3Json.ToJson(hand.position),
                ["rotation"] = Vector3Json.ToJson(hand.rotation),
            };
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "view_user_perspective requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
