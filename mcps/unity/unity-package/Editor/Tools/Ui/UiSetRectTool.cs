using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// Apply a named RectTransform preset to compress 6+ property writes into one call.
    /// Eleven presets cover the common UGUI authoring patterns: <c>stretch</c> (+optional
    /// padding), <c>top-stretch</c>/<c>bottom-stretch</c>/<c>left-stretch</c>/<c>right-stretch</c>
    /// (edge-anchored stretches with a fixed dimension), <c>top-left</c>/<c>top-right</c>/
    /// <c>bottom-left</c>/<c>bottom-right</c>/<c>center</c> (anchored boxes with explicit
    /// width/height + optional offsets), and <c>fill-axis</c> (axis-explicit stretch).
    /// The <c>params</c> object's shape varies per preset; missing required params surface
    /// as <c>InvalidInput</c> with the param name. Output echoes the resulting
    /// anchorMin / anchorMax / pivot / sizeDelta / anchoredPosition so callers can verify
    /// the rect state without a separate go_serialize roundtrip.
    /// </summary>
    [UnityMcpTool("ui_set_rect", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UiSetRectTool : IUnityMcpTool
    {
        public string Name => "ui_set_rect";

        public string Description =>
            "Apply a named RectTransform preset to compress 6+ property writes into one call. " +
            "11 presets: stretch (+padding), top/bottom/left/right-stretch (+height/width), " +
            "top-left/top-right/bottom-left/bottom-right/center (+width/height +optional offsetX/offsetY), " +
            "fill-axis (axis: x|y + size). params shape varies per preset; missing required params " +
            "surface as InvalidInput with the param name. Output echoes the resulting " +
            "anchorMin/anchorMax/pivot/sizeDelta/anchoredPosition for verification.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["rectTransformInstanceId"] = new JObject { ["type"] = "integer" },
                ["preset"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray
                    {
                        "stretch", "top-stretch", "bottom-stretch", "left-stretch", "right-stretch",
                        "top-left", "top-right", "bottom-left", "bottom-right", "center", "fill-axis",
                    },
                },
                ["params"] = new JObject
                {
                    ["type"] = "object",
                    ["additionalProperties"] = true,
                },
            },
            ["required"] = new JArray { "rectTransformInstanceId", "preset" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("rectTransformInstanceId")
                ?? throw new ToolException("InvalidInput", "'rectTransformInstanceId' is required.");
            string preset = @params.Value<string>("preset");
            if (string.IsNullOrWhiteSpace(preset))
            {
                throw new ToolException("InvalidInput", "'preset' is required.");
            }

            var rt = InstanceIdResolver.RectTransformOrThrow(id);
            var p = @params["params"] as JObject ?? new JObject();

            // Validate preset BEFORE Undo.RecordObject so an unknown preset doesn't
            // leave a no-op entry on Unity's Undo stack.
            if (!AnchorPresets.IsKnown(preset))
            {
                throw new ToolException("InvalidInput", $"Unknown preset '{preset}'.");
            }

            Undo.RecordObject(rt, $"ui_set_rect({preset})");

            // Anchor-preset math is shared with the composite create tools (one source
            // of truth in AnchorPresets — responsive-by-default discipline).
            AnchorPresets.Apply(rt, preset, p);

            EditorUtility.SetDirty(rt);

            var result = new JObject
            {
                ["rectTransformInstanceId"] = id,
                ["preset"] = preset,
                ["anchorMin"] = V2(rt.anchorMin),
                ["anchorMax"] = V2(rt.anchorMax),
                ["pivot"] = V2(rt.pivot),
                ["sizeDelta"] = V2(rt.sizeDelta),
                ["anchoredPosition"] = V2(rt.anchoredPosition),
            };
            return Task.FromResult(ToolResult.Json(result));
        }

        private static JArray V2(Vector2 v) => new JArray { v.x, v.y };
    }
}
