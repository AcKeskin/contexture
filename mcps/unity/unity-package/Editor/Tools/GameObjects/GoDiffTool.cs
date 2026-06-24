using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Tools.Diff;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Returns the structured difference between two arbitrary GameObjects, computed with the
    /// full-fidelity serializer. Output is a flat list of { path, before, after } leaves
    /// (before = A, after = B). Reuses the StructuralDiff engine verbatim — no diff logic here.
    /// Read-only.
    /// </summary>
    [UnityMcpTool("go_diff")]
    internal sealed class GoDiffTool : IUnityMcpTool
    {
        public string Name => "go_diff";

        public string Description =>
            "Diff two arbitrary GameObjects (full-fidelity). Returns " +
            "{ instanceIdA, instanceIdB, differences: [{path, before, after}] } where 'before' is A " +
            "and 'after' is B. 'depth' (default 1, max 4) bounds child expansion. Read-only.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceIdA"] = new JObject { ["type"] = "integer" },
                ["instanceIdB"] = new JObject { ["type"] = "integer" },
                ["depth"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 0,
                    ["maximum"] = 4,
                    ["default"] = 1,
                },
            },
            ["required"] = new JArray { "instanceIdA", "instanceIdB" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int idA = @params.Value<int?>("instanceIdA")
                ?? throw new ToolException("InvalidInput", "'instanceIdA' is required.");
            int idB = @params.Value<int?>("instanceIdB")
                ?? throw new ToolException("InvalidInput", "'instanceIdB' is required.");
            int depth = @params["depth"]?.Value<int>() ?? 1;
            if (depth < 0) depth = 0;
            if (depth > 4) depth = 4;

            var a = InstanceIdResolver.GameObjectOrThrow(idA, "instanceIdA");
            var b = InstanceIdResolver.GameObjectOrThrow(idB, "instanceIdB");

            var differences = StructuralDiff.DiffGameObjects(a, b, depth);

            var data = new JObject
            {
                ["instanceIdA"] = idA,
                ["instanceIdB"] = idB,
                ["differences"] = differences,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
