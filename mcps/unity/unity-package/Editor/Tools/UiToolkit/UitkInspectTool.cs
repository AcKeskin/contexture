using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Read-only structural inspection of a UI Toolkit document. Given a .uxml asset
    /// path (or a UIDocument instanceId), returns the visual-tree structure
    /// (element type, name, classes, children) plus the linked stylesheets.
    ///
    /// Matched selectors per element are only computable when the document is
    /// instantiated in a live panel (the tree must have been laid out). For an
    /// un-instantiated asset, inspect returns structure + linked stylesheets but
    /// no matched-selectors — documented limitation, not a failure.
    ///
    /// Each linked stylesheet's source text is scanned via <see cref="UssSupport"/>;
    /// any unsupported-USS usage is surfaced under <c>ussNotes</c> so an agent can
    /// audit an authored document for the same subset violations uitk_write_uss
    /// rejects at write time.
    ///
    /// Parameters (one of):
    /// <list type="bullet">
    ///   <item><term>assetPath</term><description>.uxml asset path to inspect (cloned, structure-only).</description></item>
    ///   <item><term>instanceId</term><description>UIDocument instanceId — inspects the live rootVisualElement when available.</description></item>
    /// </list>
    /// </summary>
    [UnityMcpTool("uitk_inspect")]   // ALWAYS-ON: UI Toolkit ships with the editor.
    internal sealed class UitkInspectTool : IUnityMcpTool
    {
        public string Name => "uitk_inspect";

        public string Description =>
            "Inspect a UI Toolkit document (read-only). Returns the visual-tree structure " +
            "(type, name, classes, children) + linked stylesheets. Provide assetPath (a .uxml " +
            "path — structure from the asset) OR instanceId (a UIDocument — live rootVisualElement " +
            "when instantiated). Matched selectors are only available for a live, laid-out panel; " +
            "an un-instantiated asset returns structure + stylesheets without matched selectors " +
            "(documented limitation). Returns { source, root, stylesheets[] }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["assetPath"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["instanceId"] = new JObject { ["type"] = new JArray { "integer", "null" } },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var assetPath = @params.Value<string>("assetPath");
            var instanceToken = @params["instanceId"];
            int? instanceId = instanceToken != null && instanceToken.Type != JTokenType.Null
                ? instanceToken.Value<int?>()
                : null;

            if (string.IsNullOrEmpty(assetPath) && !instanceId.HasValue)
                throw new ToolException("InvalidInput", "Provide either 'assetPath' (.uxml) or 'instanceId' (UIDocument).");

            // ------------------------------------------------------------------ live UIDocument path
            if (instanceId.HasValue)
            {
                var obj = EditorUtility.InstanceIDToObject(instanceId.Value);
                UIDocument doc = obj as UIDocument;
                if (doc == null && obj is GameObject go)
                    doc = go.GetComponent<UIDocument>();
                if (doc == null)
                    throw new ToolException("InvalidInput",
                        $"instanceId {instanceId.Value} did not resolve to a UIDocument (or a GameObject with one).");

                var live = doc.rootVisualElement;
                if (live != null)
                {
                    // Instantiated + laid out → structure WITH matched selectors.
                    var rootJson = DescribeLiveElement(live);
                    var sheets = StylesheetsFromAsset(doc.visualTreeAsset);
                    return Task.FromResult(ToolResult.Json(new JObject
                    {
                        ["source"] = "live-panel",
                        ["root"] = rootJson,
                        ["stylesheets"] = sheets,
                        ["ussNotes"] = UssNotesFor(sheets),
                        ["matchedSelectorsAvailable"] = true,
                    }));
                }

                // Not instantiated → fall through to asset-structure from its visualTreeAsset.
                var docSheets = StylesheetsFromAsset(doc.visualTreeAsset);
                return Task.FromResult(ToolResult.Json(new JObject
                {
                    ["source"] = "asset (UIDocument not instantiated)",
                    ["root"] = DescribeAssetTree(doc.visualTreeAsset),
                    ["stylesheets"] = docSheets,
                    ["ussNotes"] = UssNotesFor(docSheets),
                    ["matchedSelectorsAvailable"] = false,
                }));
            }

            // ------------------------------------------------------------------ asset path
            var vta = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(assetPath);
            if (vta == null)
                throw new ToolException("InvalidInput", $"No VisualTreeAsset at '{assetPath}'.");

            var assetSheets = StylesheetsFromAsset(vta);
            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["source"] = "asset",
                ["root"] = DescribeAssetTree(vta),
                ["stylesheets"] = assetSheets,
                ["ussNotes"] = UssNotesFor(assetSheets),
                ["matchedSelectorsAvailable"] = false,
            }));
        }

        /// <summary>
        /// Scans each linked stylesheet's on-disk USS source through <see cref="UssSupport"/>
        /// and returns a note per stylesheet that uses an unsupported property. Empty when all
        /// linked stylesheets stay within the supported subset (or none are linked / readable).
        /// This is the read-side counterpart to uitk_write_uss's write-time rejection — it lets
        /// an agent audit an already-authored document for subset drift.
        /// </summary>
        private static JArray UssNotesFor(JArray stylesheetPaths)
        {
            var notes = new JArray();
            if (stylesheetPaths == null) return notes;

            foreach (var entry in stylesheetPaths)
            {
                if (entry.Type != JTokenType.String) continue;
                var path = entry.ToString();
                if (!path.EndsWith(".uss", System.StringComparison.OrdinalIgnoreCase)) continue;
                if (!File.Exists(path)) continue;

                var violation = UssSupport.Validate(File.ReadAllText(path));
                if (violation != null)
                {
                    notes.Add(new JObject
                    {
                        ["stylesheet"] = path,
                        ["property"] = violation.Property,
                        ["workaround"] = violation.Workaround,
                    });
                }
            }
            return notes;
        }

        /// <summary>
        /// Describes a live VisualElement subtree (type, name, classes, matched selectors, children).
        /// Matched selectors are available because the element is in a live, laid-out panel.
        /// </summary>
        private static JObject DescribeLiveElement(VisualElement el)
        {
            var node = new JObject
            {
                ["type"] = el.GetType().Name,
                ["name"] = string.IsNullOrEmpty(el.name) ? null : el.name,
            };

            var classes = new JArray();
            foreach (var c in el.GetClasses())
                classes.Add(c);
            node["classes"] = classes;

            var children = new JArray();
            foreach (var child in el.Children())
                children.Add(DescribeLiveElement(child));
            node["children"] = children;

            return node;
        }

        /// <summary>
        /// Describes the structure of a VisualTreeAsset by instantiating a throwaway clone
        /// (CloneTree) and walking it. The clone is not added to any panel, so this gives
        /// structure (type/name/classes/children) but no matched selectors.
        /// </summary>
        private static JObject DescribeAssetTree(VisualTreeAsset vta)
        {
            if (vta == null)
                return new JObject { ["type"] = null, ["note"] = "no VisualTreeAsset" };

            var clone = vta.CloneTree();
            // CloneTree returns a wrapper TemplateContainer; describe its children as the
            // document roots so the output matches what the .uxml declares.
            var root = new JObject
            {
                ["type"] = clone.GetType().Name,
                ["name"] = string.IsNullOrEmpty(clone.name) ? null : clone.name,
                ["classes"] = new JArray(),
            };
            var children = new JArray();
            foreach (var child in clone.Children())
                children.Add(DescribeStructuralElement(child));
            root["children"] = children;
            return root;
        }

        /// <summary>Structure-only describe (no matched selectors) for a cloned element.</summary>
        private static JObject DescribeStructuralElement(VisualElement el)
        {
            var node = new JObject
            {
                ["type"] = el.GetType().Name,
                ["name"] = string.IsNullOrEmpty(el.name) ? null : el.name,
            };
            var classes = new JArray();
            foreach (var c in el.GetClasses())
                classes.Add(c);
            node["classes"] = classes;

            var children = new JArray();
            foreach (var child in el.Children())
                children.Add(DescribeStructuralElement(child));
            node["children"] = children;
            return node;
        }

        /// <summary>Lists the stylesheets linked by a VisualTreeAsset (best-effort via its styleSheets).</summary>
        private static JArray StylesheetsFromAsset(VisualTreeAsset vta)
        {
            var arr = new JArray();
            if (vta == null) return arr;

            // CloneTree carries the stylesheets the .uxml linked via <Style src>; read them
            // off a throwaway clone's styleSheets across the tree.
            var clone = vta.CloneTree();
            CollectStyleSheets(clone, arr);
            return arr;
        }

        private static void CollectStyleSheets(VisualElement el, JArray into)
        {
            for (int i = 0; i < el.styleSheets.count; i++)
            {
                var ss = el.styleSheets[i];
                if (ss == null) continue;
                var path = AssetDatabase.GetAssetPath(ss);
                var entry = string.IsNullOrEmpty(path) ? ss.name : path;
                if (!ContainsString(into, entry))
                    into.Add(entry);
            }
            foreach (var child in el.Children())
                CollectStyleSheets(child, into);
        }

        private static bool ContainsString(JArray arr, string value)
        {
            foreach (var t in arr)
                if (t.Type == JTokenType.String && t.ToString() == value) return true;
            return false;
        }
    }
}
