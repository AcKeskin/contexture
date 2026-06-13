using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 StatefulInteractable. Accepts ANY
    /// StatefulInteractable subclass — PressableButton, custom user-authored
    /// subclasses, etc. — via the existing type-chain walk. Useful when a
    /// user-authored type isn't covered by a more specific inspector tool;
    /// the base contract still surfaces OnClicked / dwell / voice-select /
    /// gaze-select configuration.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_stateful_interactable", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectStatefulInteractableTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_stateful_interactable";

        public string Description =>
            "Inspect an MRTK 3 StatefulInteractable or any subclass (PressableButton, " +
            "user-authored subclasses). Returns componentInstanceId, type, enabled " +
            "flag, and a serialized-field dump (OnClicked / dwell / voice-select / " +
            "toggle / gaze-select configuration). Use this when a custom subclass " +
            "isn't covered by a more specific inspector tool.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "StatefulInteractable"));
        }
    }
}
