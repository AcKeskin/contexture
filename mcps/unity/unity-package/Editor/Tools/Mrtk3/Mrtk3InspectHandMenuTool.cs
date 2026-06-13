using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 hand menu (HandConstraintPalmUp). Returns
    /// the uniform mrtk3_inspect_* envelope.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_handmenu", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectHandMenuTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_handmenu";

        public string Description =>
            "Inspect a HandConstraintPalmUp (hand menu). Returns componentInstanceId, " +
            "type, enabled flag, and the serialized-field dump (constraint hand, " +
            "palm-up activation thresholds, solver target, etc.).";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "HandConstraintPalmUp"));
        }
    }
}
