using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_XRI
using Unity.XR.CoreUtils;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Reads (in any mode) or drives (play mode only — wired in plan Step 19)
    /// the XR Interaction Simulator's head / left-hand / right-hand pose. Read
    /// returns the current pose as the rig is positioned in the scene; write
    /// in edit mode is rejected with InvalidInput.
    /// </summary>
    [UnityMcpTool("xri_simulate_pose", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriSimulatePoseTool : IUnityMcpTool
    {
        public string Name => "xri_simulate_pose";

        public string Description =>
            "Read or drive the XR Interaction Simulator pose. 'device' is 'head', " +
            "'leftHand', or 'rightHand'. With no 'position'/'rotation', returns the " +
            "current pose. With them, writes the pose — write requires play mode " +
            "(returns InvalidInput in edit mode).";

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
                    ["description"] = "Quaternion [x,y,z,w] (length 4) or Euler [x,y,z] (length 3).",
                },
            },
            ["required"] = new JArray { "device" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string device = @params.Value<string>("device");
            if (string.IsNullOrWhiteSpace(device))
            {
                throw new ToolException("InvalidInput", "'device' is required.");
            }

            bool isWrite = @params["position"] != null || @params["rotation"] != null;

            if (isWrite && !Application.isPlaying)
            {
                throw new ToolException("InvalidInput",
                    "xri_simulate_pose write requires play mode. Read works in any mode.");
            }

            var origin = XrRigLookup.FindActive();
            if (origin == null)
            {
                throw new ToolException("InvalidInput",
                    "No active XROrigin found in any loaded scene.");
            }

            if (isWrite)
            {
                var target = ResolveDeviceTransform(origin, device);
                if (target == null)
                {
                    throw new ToolException("InvalidInput",
                        $"Could not locate the '{device}' transform on the active XROrigin.");
                }

                var posArr = @params["position"] as JArray;
                var rotArr = @params["rotation"] as JArray;
                if (posArr != null)
                {
                    target.position = Vector3Json.ParseRequired(posArr, "position");
                }
                if (rotArr != null)
                {
                    if (rotArr.Count == 4)
                    {
                        target.rotation = new Quaternion(
                            rotArr[0].Value<float>(), rotArr[1].Value<float>(),
                            rotArr[2].Value<float>(), rotArr[3].Value<float>());
                    }
                    else if (rotArr.Count == 3)
                    {
                        target.eulerAngles = Vector3Json.ParseRequired(rotArr, "rotation");
                    }
                    else
                    {
                        throw new ToolException("InvalidInput",
                            "'rotation' must be length 3 (Euler) or 4 (quaternion).");
                    }
                }

                var data = new JObject
                {
                    ["device"] = device,
                    ["mode"] = "write",
                    ["isPlaying"] = true,
                    ["position"] = Vector3Json.ToJson(target.position),
                    ["rotation"] = Vector3Json.ToJson(target.rotation),
                };
                return Task.FromResult(ToolResult.Json(data));
            }

            // Read path: best-effort pose from the active rig.
            var pose = ReadPose(origin, device);
            if (pose == null)
            {
                throw new ToolException("InvalidInput",
                    $"Could not locate the '{device}' transform on the active XROrigin.");
            }

            var readData = new JObject
            {
                ["device"] = device,
                ["mode"] = "read",
                ["isPlaying"] = Application.isPlaying,
                ["position"] = Vector3Json.ToJson(pose.Value.position),
                ["rotation"] = Vector3Json.ToJson(pose.Value.rotation),
            };
            return Task.FromResult(ToolResult.Json(readData));
        }

        private static Transform ResolveDeviceTransform(XROrigin origin, string device)
        {
            if (device == "head" && origin.Camera != null) return origin.Camera.transform;
            string match = device == "leftHand" ? "Left" : (device == "rightHand" ? "Right" : null);
            return XrRigLookup.FindHandTransform(origin, match);
        }

        private static (Vector3 position, Quaternion rotation)? ReadPose(XROrigin origin, string device)
        {
            var t = ResolveDeviceTransform(origin, device);
            if (t == null) return null;
            return (t.position, t.rotation);
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_simulate_pose requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
