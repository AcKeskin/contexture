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
    /// Captures the scene from the XR Interaction Simulator's current head pose.
    /// Internally finds the active XROrigin's camera transform and feeds it to the
    /// shared CameraCapture.RenderCameraToPng path. Optional fov/width/height
    /// override the camera's defaults.
    /// </summary>
    [UnityMcpTool("view_xr_simulator", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class ViewXrSimulatorTool : IUnityMcpTool
    {
        public string Name => "view_xr_simulator";

        public string Description =>
            "Capture from the XR Interaction Simulator's current head pose. Returns " +
            "one PNG content block. Optional 'fov' (default 60), 'width' (default 1280), " +
            "'height' (default 720). Errors when no XROrigin is loaded.";

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
            return Task.FromResult(ToolResult.Png(png));
        }

#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "view_xr_simulator requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
