using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// The named RectTransform anchor presets shared by ui_set_rect and the composite
    /// create tools. Responsive-by-default: anchors (and CanvasScaler / layout groups)
    /// are the path to resolution independence; a fixed-pixel rect is the explicit
    /// exception, not the default. Exposed here as one source of truth so every UGUI
    /// create tool can take an <c>anchorPreset</c> without duplicating the math
    /// (deletion test: consumed by ui_set_rect + button + image + text + layout_group).
    /// </summary>
    internal static class AnchorPresets
    {
        public static readonly string[] Names =
        {
            "stretch", "top-stretch", "bottom-stretch", "left-stretch", "right-stretch",
            "top-left", "top-right", "bottom-left", "bottom-right", "center", "fill-axis",
        };

        public static bool IsKnown(string preset)
        {
            if (string.IsNullOrEmpty(preset)) return false;
            foreach (var n in Names) if (n == preset) return true;
            return false;
        }

        /// <summary>
        /// Applies a named anchor preset to <paramref name="rt"/>. <paramref name="p"/> carries
        /// the per-preset params (height / width / offsetX / offsetY / padding / axis+size).
        /// Throws <c>InvalidInput</c> on an unknown preset or a missing required param. Does NOT
        /// record Undo or SetDirty — the caller owns the Undo scope (a create tool registers the
        /// created object; ui_set_rect records the rect).
        /// </summary>
        public static void Apply(RectTransform rt, string preset, JObject p)
        {
            p = p ?? new JObject();
            switch (preset)
            {
                case "stretch":         ApplyStretch(rt, p); break;
                case "top-stretch":     ApplyTopStretch(rt, p); break;
                case "bottom-stretch":  ApplyBottomStretch(rt, p); break;
                case "left-stretch":    ApplyLeftStretch(rt, p); break;
                case "right-stretch":   ApplyRightStretch(rt, p); break;
                case "top-left":        ApplyTopLeft(rt, p); break;
                case "top-right":       ApplyTopRight(rt, p); break;
                case "bottom-left":     ApplyBottomLeft(rt, p); break;
                case "bottom-right":    ApplyBottomRight(rt, p); break;
                case "center":          ApplyCenter(rt, p); break;
                case "fill-axis":       ApplyFillAxis(rt, p); break;
                default:
                    throw new ToolException("InvalidInput", $"Unknown preset '{preset}'.");
            }
        }

        private static void ApplyStretch(RectTransform rt, JObject p)
        {
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(0f, 0f);
            rt.anchoredPosition = new Vector2(0f, 0f);

            var padding = OptionalPadding(p);
            if (padding != Vector4.zero)
            {
                // Padding tuple order: x=l, y=t, z=r, w=b.
                rt.offsetMin = new Vector2(padding.x, padding.w);
                rt.offsetMax = new Vector2(-padding.z, -padding.y);
            }
        }

        private static void ApplyTopStretch(RectTransform rt, JObject p)
        {
            float height = RequiredFloat(p, "height");
            float padding = OptionalFloat(p, "padding", 0f);

            rt.anchorMin = new Vector2(0f, 1f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(0.5f, 1f);
            rt.sizeDelta = new Vector2(0f, height);
            rt.anchoredPosition = new Vector2(0f, 0f);

            if (padding > 0f)
            {
                var offMin = rt.offsetMin;
                var offMax = rt.offsetMax;
                offMin.x = padding;
                offMax.x = -padding;
                rt.offsetMin = offMin;
                rt.offsetMax = offMax;
            }
        }

        private static void ApplyBottomStretch(RectTransform rt, JObject p)
        {
            float height = RequiredFloat(p, "height");
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(0f, height);
            rt.anchoredPosition = new Vector2(0f, 0f);
        }

        private static void ApplyLeftStretch(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 0.5f);
            rt.sizeDelta = new Vector2(width, 0f);
            rt.anchoredPosition = new Vector2(0f, 0f);
        }

        private static void ApplyRightStretch(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            rt.anchorMin = new Vector2(1f, 0f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(1f, 0.5f);
            rt.sizeDelta = new Vector2(width, 0f);
            rt.anchoredPosition = new Vector2(0f, 0f);
        }

        private static void ApplyTopLeft(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            float height = RequiredFloat(p, "height");
            float offsetX = OptionalFloat(p, "offsetX", 0f);
            float offsetY = OptionalFloat(p, "offsetY", 0f);

            rt.anchorMin = new Vector2(0f, 1f);
            rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 1f);
            rt.sizeDelta = new Vector2(width, height);
            // pivot.y=1 → +y goes up; offsetY pushes DOWN from the top edge.
            rt.anchoredPosition = new Vector2(offsetX, -offsetY);
        }

        private static void ApplyTopRight(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            float height = RequiredFloat(p, "height");
            float offsetX = OptionalFloat(p, "offsetX", 0f);
            float offsetY = OptionalFloat(p, "offsetY", 0f);

            rt.anchorMin = new Vector2(1f, 1f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(1f, 1f);
            rt.sizeDelta = new Vector2(width, height);
            // offsetX pushes LEFT from right edge; offsetY pushes DOWN from top edge.
            rt.anchoredPosition = new Vector2(-offsetX, -offsetY);
        }

        private static void ApplyBottomLeft(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            float height = RequiredFloat(p, "height");
            float offsetX = OptionalFloat(p, "offsetX", 0f);
            float offsetY = OptionalFloat(p, "offsetY", 0f);

            rt.anchorMin = new Vector2(0f, 0f);
            rt.anchorMax = new Vector2(0f, 0f);
            rt.pivot = new Vector2(0f, 0f);
            rt.sizeDelta = new Vector2(width, height);
            // offsetX pushes RIGHT; offsetY pushes UP.
            rt.anchoredPosition = new Vector2(offsetX, offsetY);
        }

        private static void ApplyBottomRight(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            float height = RequiredFloat(p, "height");
            float offsetX = OptionalFloat(p, "offsetX", 0f);
            float offsetY = OptionalFloat(p, "offsetY", 0f);

            rt.anchorMin = new Vector2(1f, 0f);
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(1f, 0f);
            rt.sizeDelta = new Vector2(width, height);
            // offsetX pushes LEFT from right edge; offsetY pushes UP from bottom edge.
            rt.anchoredPosition = new Vector2(-offsetX, offsetY);
        }

        private static void ApplyCenter(RectTransform rt, JObject p)
        {
            float width = RequiredFloat(p, "width");
            float height = RequiredFloat(p, "height");
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(width, height);
            rt.anchoredPosition = new Vector2(0f, 0f);
        }

        private static void ApplyFillAxis(RectTransform rt, JObject p)
        {
            string axis = RequiredString(p, "axis");
            float size = RequiredFloat(p, "size");

            if (axis == "x")
            {
                rt.anchorMin = new Vector2(0f, 0.5f);
                rt.anchorMax = new Vector2(1f, 0.5f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(0f, size);
                rt.anchoredPosition = new Vector2(0f, 0f);
            }
            else if (axis == "y")
            {
                rt.anchorMin = new Vector2(0.5f, 0f);
                rt.anchorMax = new Vector2(0.5f, 1f);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(size, 0f);
                rt.anchoredPosition = new Vector2(0f, 0f);
            }
            else
            {
                throw new ToolException("InvalidInput",
                    $"'axis' must be 'x' or 'y' (got '{axis}').");
            }
        }

        private static float RequiredFloat(JObject p, string name)
        {
            var tok = p[name];
            if (tok == null || tok.Type == JTokenType.Null)
                throw new ToolException("InvalidInput", $"'{name}' is required.");
            if (tok.Type != JTokenType.Float && tok.Type != JTokenType.Integer)
                throw new ToolException("InvalidInput", $"'{name}' must be a number.");
            return tok.Value<float>();
        }

        private static string RequiredString(JObject p, string name)
        {
            var tok = p[name];
            if (tok == null || tok.Type == JTokenType.Null)
                throw new ToolException("InvalidInput", $"'{name}' is required.");
            if (tok.Type != JTokenType.String)
                throw new ToolException("InvalidInput", $"'{name}' must be a string.");
            return tok.Value<string>();
        }

        private static float OptionalFloat(JObject p, string name, float def)
        {
            var tok = p[name];
            if (tok == null || tok.Type == JTokenType.Null) return def;
            if (tok.Type != JTokenType.Float && tok.Type != JTokenType.Integer)
                throw new ToolException("InvalidInput", $"'{name}' must be a number.");
            return tok.Value<float>();
        }

        // Returns (l, t, r, b) as Vector4(x=l, y=t, z=r, w=b). Accepts a uniform number
        // or an object {l, t, r, b}. Missing → Vector4.zero.
        private static Vector4 OptionalPadding(JObject p)
        {
            var tok = p["padding"];
            if (tok == null || tok.Type == JTokenType.Null) return Vector4.zero;

            if (tok.Type == JTokenType.Float || tok.Type == JTokenType.Integer)
            {
                float v = tok.Value<float>();
                return new Vector4(v, v, v, v);
            }

            if (tok is JObject obj)
            {
                float l = OptionalFloat(obj, "l", 0f);
                float t = OptionalFloat(obj, "t", 0f);
                float r = OptionalFloat(obj, "r", 0f);
                float b = OptionalFloat(obj, "b", 0f);
                return new Vector4(l, t, r, b);
            }

            throw new ToolException("InvalidInput",
                "'padding' must be a number or an object {l, t, r, b}.");
        }
    }

    /// <summary>
    /// Shared helpers for the ui_create_* and ui_set_rect tools. Extracted to
    /// keep the per-tool files focused on shape + dispatch; the helpers below
    /// were identical across multiple tools before the extraction (DRY).
    /// </summary>
    internal static class UiToolShared
    {
        /// <summary>
        /// Applies an optional <c>anchorPreset</c> (+ <c>anchorParams</c>) from a tool's params
        /// to a freshly created element's RectTransform. No-op when <c>anchorPreset</c> is absent
        /// (the element keeps its default rect). This is the responsive-by-default seam: a create
        /// tool that forwards these params gets anchor-based responsiveness in the same call,
        /// instead of a fixed-pixel rect the caller must fix up with a follow-up ui_set_rect.
        /// Validates the preset name and throws <c>InvalidInput</c> on an unknown preset.
        /// </summary>
        public static void ApplyOptionalAnchorPreset(RectTransform rt, JObject toolParams)
        {
            var presetTok = toolParams["anchorPreset"];
            if (presetTok == null || presetTok.Type == JTokenType.Null) return;

            var preset = presetTok.Value<string>();
            if (!AnchorPresets.IsKnown(preset))
                throw new ToolException("InvalidInput",
                    $"Unknown anchorPreset '{preset}'. Valid: {string.Join(", ", AnchorPresets.Names)}.");

            var anchorParams = toolParams["anchorParams"] as JObject ?? new JObject();
            AnchorPresets.Apply(rt, preset, anchorParams);
        }

        /// <summary>
        /// Fluent helper: adds the <c>anchorPreset</c> + <c>anchorParams</c> property entries to
        /// a tool's InputSchema and returns the same schema object so it can be chained onto a
        /// schema literal (<c>new JObject { … }.AddAnchorPresetProps()</c>). Keeps the responsive
        /// surface identical across every anchor-preset-aware create tool. Expects the standard
        /// shape with a <c>["properties"]</c> JObject.
        /// </summary>
        public static JObject AddAnchorPresetProps(this JObject schema)
        {
            if (schema["properties"] is JObject properties)
            {
                properties["anchorPreset"] = new JObject
                {
                    ["type"] = new JArray { "string", "null" },
                    ["enum"] = BuildPresetEnum(),
                    ["description"] = "Optional named anchor preset for responsive placement " +
                        "(stretch, top-stretch, center, fill-axis, …). When set, the element is " +
                        "anchored responsively instead of using a fixed pixel rect. anchorParams " +
                        "carries the per-preset values (height/width/offsetX/offsetY/padding/axis+size).",
                };
                properties["anchorParams"] = new JObject
                {
                    ["type"] = new JArray { "object", "null" },
                    ["additionalProperties"] = true,
                    ["description"] = "Per-preset params for anchorPreset (e.g. { height } for top-stretch, " +
                        "{ width, height, offsetX, offsetY } for corner presets, { axis, size } for fill-axis).",
                };
            }
            return schema;
        }

        private static JArray BuildPresetEnum()
        {
            var arr = new JArray();
            foreach (var n in AnchorPresets.Names) arr.Add(n);
            arr.Add(null); // allow explicit null = "no preset"
            return arr;
        }

        /// <summary>
        /// Strips dashes / underscores / spaces from an enum-name string so
        /// downstream <c>Enum.Parse(..., ignoreCase: true)</c> tolerates
        /// "top-left" / "top_left" / "TopLeft" / "topleft" uniformly.
        /// </summary>
        public static string NormalizeEnumName(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            var sb = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                var c = s[i];
                if (c == '-' || c == '_' || c == ' ') continue;
                sb.Append(c);
            }
            return sb.ToString();
        }

        /// <summary>
        /// Parses a JSON color array <c>[r, g, b, a?]</c> (alpha defaults to 1).
        /// Returns null for null / empty / under-length arrays so callers can
        /// branch with "leave default if no color given".
        /// </summary>
        public static Color? ParseColor(JArray a)
        {
            if (a == null || a.Count < 3) return null;
            float r = a[0].Value<float>();
            float g = a[1].Value<float>();
            float b = a[2].Value<float>();
            float alpha = a.Count >= 4 ? a[3].Value<float>() : 1f;
            return new Color(r, g, b, alpha);
        }

        /// <summary>
        /// Applies optional LayoutElement params from a JObject to a
        /// LayoutElement component. Missing keys leave the existing value
        /// unchanged. Shared by ui_create_text and ui_create_image (the two
        /// tools whose Output schema includes an optional layoutElement block).
        /// </summary>
        public static void ApplyLayoutElementParams(LayoutElement le, JObject p)
        {
            if (p == null) return;
            if (p.TryGetValue("minWidth", out var minW)) le.minWidth = minW.Value<float>();
            if (p.TryGetValue("minHeight", out var minH)) le.minHeight = minH.Value<float>();
            if (p.TryGetValue("preferredWidth", out var prefW)) le.preferredWidth = prefW.Value<float>();
            if (p.TryGetValue("preferredHeight", out var prefH)) le.preferredHeight = prefH.Value<float>();
            if (p.TryGetValue("flexibleWidth", out var flexW)) le.flexibleWidth = flexW.Value<float>();
            if (p.TryGetValue("flexibleHeight", out var flexH)) le.flexibleHeight = flexH.Value<float>();
        }
    }
}
