using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
#if UNITY_MCP_HAS_XRI

#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Returns inspect-time state of an XRBaseInteractor: type, hover/select sets,
    /// attach transform, current targets (as instanceIds the agent can chain to
    /// xri_inspect_interactable).
    /// </summary>
    [UnityMcpTool("xri_inspect_interactor", Requires = new[] { CapabilityKey.Xri })]
    internal sealed class XriInspectInteractorTool : IUnityMcpTool
    {
        public string Name => "xri_inspect_interactor";

        public string Description =>
            "Inspect an XRBaseInteractor. Returns type, enabled flag, hover/select " +
            "target instanceIds, attach transform pose. Errors when instanceId does " +
            "not resolve to an interactor.";

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
            var ix = comp as UnityEngine.XR.Interaction.Toolkit.Interactors.XRBaseInteractor;
            if (ix == null)
            {
                throw new ToolException("InvalidInput",
                    $"componentInstanceId {id} is {comp.GetType().Name}, not an XRBaseInteractor.");
            }

            var hovered = new JArray();
            foreach (var target in ix.interactablesHovered)
            {
                if (target is UnityEngine.Object uo && uo != null)
                {
                    hovered.Add(uo.GetInstanceID());
                }
            }
            var selected = new JArray();
            foreach (var target in ix.interactablesSelected)
            {
                if (target is UnityEngine.Object uo && uo != null)
                {
                    selected.Add(uo.GetInstanceID());
                }
            }

            var attach = ix.attachTransform != null ? ix.attachTransform : ix.transform;
            var data = new JObject
            {
                ["instanceId"] = id,
                ["type"] = ix.GetType().Name,
                ["name"] = ix.name,
                ["enabled"] = ix.enabled,
                ["interactionLayers"] = (int)ix.interactionLayers.value,
                ["isHovering"] = ix.hasHover,
                ["isSelecting"] = ix.hasSelection,
                ["hovered"] = hovered,
                ["selected"] = selected,
                ["attachPosition"] = Vector3Json.ToJson(attach.position),
                ["attachRotation"] = Vector3Json.ToJson(attach.rotation),
            };
            return Task.FromResult(ToolResult.Json(data));
        }
#else
        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            throw new ToolException("InvalidInput",
                "xri_inspect_interactor requires com.unity.xr.interaction.toolkit (≥2.0.0).");
        }
#endif
    }
}
