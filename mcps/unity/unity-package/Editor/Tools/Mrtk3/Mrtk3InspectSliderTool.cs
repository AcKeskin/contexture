using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 Slider (or subclass). Returns the uniform
    /// mrtk3_inspect_* envelope with all serialized fields dumped — value /
    /// minValue / maxValue / Selectedness wiring, audio-feedback config, etc.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_slider", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectSliderTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_slider";

        public string Description =>
            "Inspect an MRTK 3 Slider (or subclass). Returns componentInstanceId, " +
            "type, enabled flag, and a serialized-field dump including continuous " +
            "value / minValue / maxValue / Selectedness configuration.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "Slider"));
        }
    }
}
