using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Type-dispatching inspector across the MRTK 3 SolverHandler family —
    /// SolverHandler (the per-target driver), Solver (the abstract base for
    /// Follow / HandConstraintPalmUp / RadialView / TapToPlace / etc.), and
    /// ConstraintManager. Input is any componentInstanceId pointing at one of
    /// these; output adds a <c>resolvedType</c> field naming which dispatch
    /// family member matched, alongside the standard envelope fields.
    ///
    /// The allowlist is intentionally short — Solver covers all concrete
    /// solvers transitively, so we don't enumerate Follow / HandConstraintPalmUp /
    /// RadialView one by one.
    /// </summary>
    [UnityMcpTool("mrtk3_inspect_solver", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3InspectSolverTool : IUnityMcpTool
    {
        private static readonly string[] _allowedBases =
        {
            "SolverHandler",
            "Solver",
            "ConstraintManager",
        };

        public string Name => "mrtk3_inspect_solver";

        public string Description =>
            "Inspect an MRTK 3 SolverHandler / Solver-derived (Follow, " +
            "HandConstraintPalmUp, RadialView, TapToPlace, …) / ConstraintManager. " +
            "Type-dispatches on the componentInstanceId; output includes a " +
            "'resolvedType' field naming which family member matched, alongside the " +
            "standard envelope fields.";

        public JObject InputSchema => Mrtk3InspectShared.ComponentInstanceIdSchema();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");

            var comp = InstanceIdResolver.ComponentOrThrow(id);

            string resolvedBase = null;
            foreach (var baseName in _allowedBases)
            {
                if (Mrtk3Types.IsInstanceOf(comp, baseName)) { resolvedBase = baseName; break; }
            }
            if (resolvedBase == null)
            {
                throw new ToolException("InvalidInput",
                    $"componentInstanceId {id} is {comp.GetType().Name} — not a SolverHandler, Solver, or ConstraintManager.");
            }

            var envelope = Mrtk3InspectShared.BuildEnvelopeJson(comp, comp.GetType().Name);
            envelope["resolvedType"] = resolvedBase;
            return Task.FromResult(ToolResult.Json(envelope));
        }
    }
}
