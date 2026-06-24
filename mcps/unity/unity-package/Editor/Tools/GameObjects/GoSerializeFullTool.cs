using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Full-fidelity counterpart to <c>go_serialize</c>. Identical shape and traversal, but
    /// complex serialized types — AnimationCurve, Gradient, [SerializeReference]/ManagedReference,
    /// ExposedReference — are serialized in full instead of rendered as "&lt;unsupported: T&gt;".
    /// Kept a distinct tool (rather than a flag on go_serialize) so the cheap lossy dump stays
    /// cheap and the full dump is explicit at the call site. 'depth' (default 1, max 4) controls
    /// child expansion; cycles broken via visited-set on instance ID.
    /// </summary>
    [UnityMcpTool("go_serialize_full")]
    internal sealed class GoSerializeFullTool : IUnityMcpTool
    {
        public string Name => "go_serialize_full";

        public string Description =>
            "Dump a GameObject + its components as JSON at FULL fidelity. Unlike go_serialize, " +
            "complex types ('AnimationCurve', 'Gradient', '[SerializeReference]', " +
            "'ExposedReference') are serialized in full, not marked '<unsupported: T>'. " +
            "'depth' (default 1, max 4) controls child expansion; 'includeComponentFields' " +
            "(default true) toggles field bodies. Cycles broken via visited-set; deep/cyclic " +
            "[SerializeReference] graphs are depth-capped and marked '$truncated'. Read-only.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["depth"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 0,
                    ["maximum"] = 4,
                    ["default"] = 1,
                },
                ["includeComponentFields"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = true,
                    ["description"] = "When false, components are returned as type+id summaries only.",
                },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");
            int depth = @params["depth"]?.Value<int>() ?? 1;
            bool includeFields = @params["includeComponentFields"]?.Value<bool>() ?? true;
            if (depth < 0) depth = 0;
            if (depth > 4) depth = 4;

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            var data = FullDump.SerializeGo(go, depth, includeFields);
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
