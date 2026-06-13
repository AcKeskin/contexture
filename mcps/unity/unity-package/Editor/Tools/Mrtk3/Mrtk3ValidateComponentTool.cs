using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Tools.Validation;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Deprecated alias for <see cref="ValidateComponentTool"/>. The validator's
    /// home moved out of the Mrtk3/ namespace when the MRTK-only gate was
    /// removed and engine-type rules (CanvasUsesWorldSpaceScale, …) joined the
    /// corpus. This shim keeps the old tool name <c>mrtk3_validate_component</c>
    /// working for any consumer that pinned on it. Functionally identical to
    /// <see cref="ValidateComponentTool"/>; capability-gated on Mrtk so it
    /// surfaces only in MRTK projects (matches the original's behavior).
    /// </summary>
    [UnityMcpTool("mrtk3_validate_component", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3ValidateComponentTool : IUnityMcpTool
    {
        public string Name => "mrtk3_validate_component";

        public string Description =>
            "(deprecated alias — use validate_component) Runs validation rules " +
            "against any component. Same behavior and output shape as " +
            "validate_component; this name is retained for backward " +
            "compatibility and only surfaces in MRTK projects.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            return Task.FromResult(ValidationDispatcher.Run(id));
        }
    }
}
