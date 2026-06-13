using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 BoundsControl. Returns the uniform
    /// mrtk3_inspect_* envelope.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_bounds_control", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectBoundsControlTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_bounds_control";

        public string Description =>
            "Inspect a BoundsControl. Returns componentInstanceId, type, enabled flag, " +
            "and the serialized-field dump (handles config, manipulation flags, " +
            "constraint stack, target).";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "BoundsControl"));
        }
    }
}
