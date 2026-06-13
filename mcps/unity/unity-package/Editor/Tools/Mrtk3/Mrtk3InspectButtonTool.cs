using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 PressableButton (or subclass). Returns the
    /// uniform mrtk3_inspect_* envelope with all serialized fields dumped.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_button", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectButtonTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_button";

        public string Description =>
            "Inspect a PressableButton (or subclass). Returns componentInstanceId, " +
            "type, enabled flag, and a serialized-field dump (audio feedback config, " +
            "click events, etc.).";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "PressableButton"));
        }
    }
}
