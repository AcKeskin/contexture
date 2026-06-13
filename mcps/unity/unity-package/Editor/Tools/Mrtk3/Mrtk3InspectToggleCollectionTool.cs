using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 ToggleCollection. Returns the uniform
    /// mrtk3_inspect_* envelope. ToggleCollection coordinates a group of
    /// StatefulInteractable toggles in the mutually-exclusive (radio) selection
    /// model — exactly one is selected at a time. Per-toggle audio feedback is
    /// configured on each underlying interactable, not centrally.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_toggle_collection", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectToggleCollectionTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_toggle_collection";

        public string Description =>
            "Inspect an MRTK 3 ToggleCollection. Returns componentInstanceId, " +
            "type, enabled flag, and a serialized-field dump. ToggleCollection " +
            "models mutually-exclusive selection across child toggles; per-toggle " +
            "audio is on each toggle, not on the collection.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "ToggleCollection"));
        }
    }
}
