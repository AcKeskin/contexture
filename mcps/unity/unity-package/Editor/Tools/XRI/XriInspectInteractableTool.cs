using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_XRI

#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Returns inspect-time state of an XRBaseInteractable: type, hover/select counts,
    /// interaction layer mask, attach transform pose, current interactor refs.
    /// </summary>
    [UnityMcpTool("xri_inspect_interactable", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriInspectInteractableTool : IUnityMcpTool
    {
        public string Name => "xri_inspect_interactable";

        public string Description =>
            "Inspect an XRBaseInteractable. Returns type, enabled flag, current " +
            "interactors hovering/selecting it, interaction layer mask, and attach " +
            "transform pose.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

#if UNITY_MCP_HAS_XRI
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            var comp = InstanceIdResolver.ComponentOrThrow(id, "instanceId");
            var ia = comp as UnityEngine.XR.Interaction.Toolkit.Interactables.XRBaseInteractable;
            if (ia == null)
            {
                throw new ToolException("InvalidInput",
                    $"componentInstanceId {id} is {comp.GetType().Name}, not an XRBaseInteractable.");
            }

            var hovering = new JArray();
            foreach (var ix in ia.interactorsHovering)
            {
                if (ix is UnityEngine.Object uo && uo != null) hovering.Add(uo.GetInstanceID());
            }
            var selecting = new JArray();
            foreach (var ix in ia.interactorsSelecting)
            {
                if (ix is UnityEngine.Object uo && uo != null) selecting.Add(uo.GetInstanceID());
            }

            // attachTransform on interactables can be null; fall back to the GO's transform.
            var attach = ia.transform;
            var data = new JObject
            {
                ["instanceId"] = id,
                ["type"] = ia.GetType().Name,
                ["name"] = ia.name,
                ["enabled"] = ia.enabled,
                ["interactionLayers"] = (int)ia.interactionLayers.value,
                ["isHovered"] = ia.isHovered,
                ["isSelected"] = ia.isSelected,
                ["hoveringInteractors"] = hovering,
                ["selectingInteractors"] = selecting,
                ["transformPosition"] = Vector3Json.ToJson(attach.position),
                ["transformRotation"] = Vector3Json.ToJson(attach.rotation),
            };
            return Task.FromResult(ToolResult.Json(data));
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_inspect_interactable requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
