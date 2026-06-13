using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// Read-only inspection of a UGUI hierarchy. Given a Canvas or GameObject instanceId,
    /// walks the subtree emitting per-node component type names, RectTransform
    /// anchors/pivot/sizeDelta/anchoredPosition, and Graphic.raycastTarget state.
    /// Flags rule smells (a heuristic list, not hard errors) so an agent gets the same
    /// drift signal the review skill gives a human:
    /// <list type="bullet">
    ///   <item>raycast-target enabled on a non-interactive Graphic (wasted raycasts).</item>
    ///   <item>mixed legacy Text + TextMeshProUGUI under one root.</item>
    ///   <item>many Graphics on one Canvas (rebatch churn — one-Canvas-per-changing-layer).</item>
    /// </list>
    /// </summary>
    [UnityMcpTool("ugui_inspect", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UguiInspectTool : IUnityMcpTool
    {
        public string Name => "ugui_inspect";

        public string Description =>
            "Inspect a UGUI hierarchy (read-only). Given a Canvas or GameObject instanceId, " +
            "returns the tree with each node's components, RectTransform anchorMin/anchorMax/" +
            "pivot/sizeDelta/anchoredPosition, and Graphic.raycastTarget. Flags smells " +
            "(heuristics, not errors): raycast-target on non-interactive graphics, mixed " +
            "legacy Text + TextMeshProUGUI, many graphics on one Canvas. Params: instanceId " +
            "(integer, required). Returns { root, smells[] }.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int instanceId = @params.Value<int?>("instanceId")
                ?? throw new ToolException("InvalidInput", "'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(instanceId, "instanceId");

            var smells = new JArray();
            var counters = new SmellCounters();

            var root = DescribeNode(go, smells, counters);

            // Post-walk aggregate smells.
            if (counters.LegacyTextCount > 0 && counters.TmpCount > 0)
                smells.Add($"Mixed text systems under this root: {counters.LegacyTextCount} legacy Text + " +
                           $"{counters.TmpCount} TextMeshProUGUI. Prefer TMP consistently (ugui-skill-usage.md).");

            if (counters.GraphicCount > 12)
                smells.Add($"{counters.GraphicCount} Graphics under one root — if many change at runtime, " +
                           "split static vs dynamic onto separate Canvases to limit rebatch churn " +
                           "(one-Canvas-per-changing-layer).");

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["root"] = root,
                ["smells"] = smells,
            }));
        }

        private static JObject DescribeNode(GameObject go, JArray smells, SmellCounters counters)
        {
            var node = new JObject
            {
                ["name"] = go.name,
                ["instanceId"] = go.GetInstanceID(),
                ["active"] = go.activeSelf,
            };

            // Component type names.
            var comps = new JArray();
            var components = go.GetComponents<Component>();
            bool hasSelectable = false;
            foreach (var c in components)
            {
                if (c == null) { comps.Add("<missing script>"); continue; }
                var typeName = c.GetType().Name;
                comps.Add(typeName);
                if (c is Selectable) hasSelectable = true;
                if (typeName == "Text") counters.LegacyTextCount++;
                if (typeName == "TextMeshProUGUI") counters.TmpCount++;
            }
            node["components"] = comps;

            // RectTransform geometry.
            var rt = go.GetComponent<RectTransform>();
            if (rt != null)
            {
                node["rect"] = new JObject
                {
                    ["anchorMin"] = Vec2(rt.anchorMin),
                    ["anchorMax"] = Vec2(rt.anchorMax),
                    ["pivot"] = Vec2(rt.pivot),
                    ["sizeDelta"] = Vec2(rt.sizeDelta),
                    ["anchoredPosition"] = Vec2(rt.anchoredPosition),
                };
            }

            // Graphic raycast state + smell.
            var graphic = go.GetComponent<Graphic>();
            if (graphic != null)
            {
                counters.GraphicCount++;
                node["raycastTarget"] = graphic.raycastTarget;

                // Smell: raycastTarget on a Graphic that isn't part of an interactive control
                // and has no Selectable on the same GameObject → wasted raycasts.
                if (graphic.raycastTarget && !hasSelectable)
                {
                    smells.Add($"'{go.name}': raycastTarget is ON but the GameObject has no Selectable " +
                               "(Button/Toggle/etc.). Disable raycastTarget on static graphics to cut raycast cost.");
                }
            }

            // Children.
            var children = new JArray();
            var t = go.transform;
            for (int i = 0; i < t.childCount; i++)
                children.Add(DescribeNode(t.GetChild(i).gameObject, smells, counters));
            node["children"] = children;

            return node;
        }

        private static JArray Vec2(Vector2 v) => new JArray { v.x, v.y };

        private sealed class SmellCounters
        {
            public int LegacyTextCount;
            public int TmpCount;
            public int GraphicCount;
        }
    }
}
