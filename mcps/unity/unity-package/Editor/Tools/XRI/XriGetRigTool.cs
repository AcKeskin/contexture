using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_XRI
using UnityEngine;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Returns a structured view of the active XR Origin (rig) — head transform,
    /// controllers/hands, locomotion providers, and interactor instance IDs the
    /// agent can hand to xri_inspect_interactor / xri_simulate_pose.
    /// </summary>
    [UnityMcpTool("xri_get_rig", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriGetRigTool : IUnityMcpTool
    {
        public string Name => "xri_get_rig";

        public string Description =>
            "Return the active XROrigin: head transform, interactors (instanceIds + types), " +
            "and locomotion providers. Errors if no XROrigin is loaded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var origin = XrRigLookup.FindActive();
            if (origin == null)
            {
                throw new ToolException("InvalidInput",
                    "No active XROrigin found in any loaded scene.");
            }

            var headT = origin.Camera != null ? origin.Camera.transform : origin.transform;
            var interactors = new JArray();
            foreach (var ix in origin.GetComponentsInChildren<UnityEngine.XR.Interaction.Toolkit.Interactors.XRBaseInteractor>(true))
            {
                interactors.Add(new JObject
                {
                    ["instanceId"] = ix.GetInstanceID(),
                    ["type"] = ix.GetType().Name,
                    ["name"] = ix.name,
                    ["enabled"] = ix.enabled,
                });
            }
            var providers = new JArray();
            foreach (var prov in origin.GetComponentsInChildren<MonoBehaviour>(true))
            {
                if (prov == null) continue;
                var t = prov.GetType();
                if (!t.Name.EndsWith("LocomotionProvider")) continue;
                providers.Add(new JObject
                {
                    ["instanceId"] = prov.GetInstanceID(),
                    ["type"] = t.Name,
                    ["name"] = prov.name,
                });
            }

            var data = new JObject
            {
                ["originInstanceId"] = origin.gameObject.GetInstanceID(),
                ["originName"] = origin.name,
                ["headInstanceId"] = headT.gameObject.GetInstanceID(),
                ["headPosition"] = Vector3Json.ToJson(headT.position),
                ["headRotation"] = Vector3Json.ToJson(headT.rotation),
                ["interactors"] = interactors,
                ["locomotionProviders"] = providers,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_get_rig requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
