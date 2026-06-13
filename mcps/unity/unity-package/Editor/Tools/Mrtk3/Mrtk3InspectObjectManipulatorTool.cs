using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 ObjectManipulator. Returns the uniform
    /// mrtk3_inspect_* envelope.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_object_manipulator", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectObjectManipulatorTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_object_manipulator";

        public string Description =>
            "Inspect an ObjectManipulator. Returns componentInstanceId, type, enabled " +
            "flag, and the serialized-field dump (allowed manipulation types, smoothing " +
            "config, near/far interaction config, target).";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "ObjectManipulator"));
        }
    }
}
