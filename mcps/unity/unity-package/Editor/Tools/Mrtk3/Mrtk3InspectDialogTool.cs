using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Inspect-time view of an MRTK 3 Dialog. Returns the uniform
    /// mrtk3_inspect_* envelope. Note: dialogs are constructed at runtime
    /// through DialogPool, not by direct instantiation — this inspector
    /// reports the dialog's serialized configuration (header / body / footer
    /// transforms, button binding) for an existing instance only.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_dialog", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectDialogTool : IUnityMcpTool
    {
        public string Name => "mrtk3_inspect_dialog";

        public string Description =>
            "Inspect an MRTK 3 Dialog. Returns componentInstanceId, type, enabled " +
            "flag, and a serialized-field dump (header/body/footer transforms, " +
            "button bindings, UnityEvents). Dialogs are constructed at runtime " +
            "through DialogPool — this tool inspects existing instances only, " +
            "it does not create them.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(Mrtk3InspectShared.InspectByType(id, "Dialog"));
        }
    }
}
