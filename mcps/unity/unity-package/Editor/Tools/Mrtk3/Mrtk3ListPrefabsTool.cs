using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Mrtk3Knowledge;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Returns the curated MRTK 3 prefab catalog from prefabs.yaml. Filters
    /// optional: <c>category</c> (button / handmenu / dialog / slider / ...)
    /// and <c>canvas</c> (canvas / noncanvas / both / all). Filter values
    /// "all" and "both" are tolerated as aliases for omitted-filter so the
    /// tool feels forgiving from the agent side.
    ///
    /// Each item carries a <c>packageInstalled</c> flag — true when the
    /// declared MRTK package resolves in the current Editor project.
    /// Path is package-relative; the tool does NOT pre-resolve to an
    /// absolute path because resolution is install-state-dependent and the
    /// caller can compose <c>Packages/&lt;package&gt;/&lt;path&gt;</c> if it needs
    /// to drive prefab_instantiate.
    /// </summary>
    [UnityMcpTool("mrtk3_list_prefabs", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3ListPrefabsTool : IUnityMcpTool
    {
        public string Name => "mrtk3_list_prefabs";

        public string Description =>
            "Curated MRTK 3 prefab catalog. Optional filters: category " +
            "(button/handmenu/dialog/slider/toggle/panel) and canvas (canvas/noncanvas). " +
            "Empty/missing filters return everything; 'all' and 'both' are accepted " +
            "as filter-aliases. Each item: name, package, package-relative path, " +
            "category, canvas variant, sizeMm if applicable, variantOf if applicable, " +
            "packageInstalled. PackageInstalled=false means the prefab's package isn't " +
            "in this project.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["category"] = new JObject { ["type"] = "string" },
                ["canvas"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "canvas", "noncanvas", "both", "all" },
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var category = @params.Value<string>("category");
            var canvas = @params.Value<string>("canvas");

            bool ignoreCategory = string.IsNullOrEmpty(category) || category == "all";
            bool ignoreCanvas = string.IsNullOrEmpty(canvas) || canvas == "all" || canvas == "both";

            var corpus = Mrtk3KnowledgeCorpus.Get();
            var items = new JArray();
            foreach (var prefab in corpus.Prefabs)
            {
                if (!ignoreCategory && !string.Equals(prefab.Category, category, System.StringComparison.OrdinalIgnoreCase))
                    continue;
                if (!ignoreCanvas && !string.Equals(prefab.Canvas, canvas, System.StringComparison.OrdinalIgnoreCase))
                    continue;

                var item = new JObject
                {
                    ["name"] = prefab.Name,
                    ["package"] = prefab.Package,
                    ["path"] = prefab.Path,
                    ["category"] = prefab.Category,
                    ["canvas"] = prefab.Canvas,
                    ["packageInstalled"] = Mrtk3PathResolver.IsPackageInstalled(prefab.Package),
                };
                if (prefab.SizeMm != null && prefab.SizeMm.Count > 0)
                {
                    var size = new JArray();
                    foreach (var s in prefab.SizeMm) size.Add(s);
                    item["sizeMm"] = size;
                }
                if (!string.IsNullOrEmpty(prefab.VariantOf))
                    item["variantOf"] = prefab.VariantOf;

                items.Add(item);
            }

            var data = new JObject
            {
                ["count"] = items.Count,
                ["items"] = items,
            };
            if (corpus.ErrorCount > 0)
                data["corpusErrors"] = corpus.ErrorCount;
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
