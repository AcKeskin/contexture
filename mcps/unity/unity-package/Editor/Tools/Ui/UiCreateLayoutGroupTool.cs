using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Tools.UiToolkit;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// Composite factory for a UGUI layout-group container. Creates a
    /// GameObject under <c>parentInstanceId</c> with RectTransform plus
    /// one of <see cref="VerticalLayoutGroup"/> / <see cref="HorizontalLayoutGroup"/>
    /// / <see cref="GridLayoutGroup"/> based on the <c>type</c> param.
    ///
    /// <c>controlChild</c> flag mapping is partial for GridLayoutGroup
    /// (grid uses <c>cellSize</c> instead of per-axis child-control flags);
    /// flags that don't apply to a given layout type are silently ignored.
    /// </summary>
    [UnityMcpTool("ui_create_layout_group", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UiCreateLayoutGroupTool : IUnityMcpTool
    {
        public string Name => "ui_create_layout_group";

        public string Description =>
            "Create a GameObject with RectTransform + Vertical/Horizontal/GridLayoutGroup. " +
            "type: vertical | horizontal | grid. padding: number (uniform) | {l,t,r,b} | null. " +
            "spacing: number | null. childAlignment: upper-left | upper-center | upper-right | " +
            "middle-left | middle-center | middle-right | lower-left | lower-center | lower-right | null. " +
            "controlChild (vertical/horizontal only): { width?, height?, expandWidth?, expandHeight?, " +
            "scaleWidth?, scaleHeight? }. cellSize (grid only): [width, height]. Flags that don't " +
            "apply to the chosen type are silently ignored.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["parentInstanceId"] = new JObject { ["type"] = "integer" },
                ["name"] = new JObject { ["type"] = "string" },
                ["type"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "vertical", "horizontal", "grid" },
                },
                ["padding"] = new JObject
                {
                    ["description"] = "Number (uniform) or object {l, t, r, b} or null.",
                },
                ["spacing"] = new JObject { ["type"] = new JArray { "number", "null" } },
                ["childAlignment"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["controlChild"] = new JObject
                {
                    ["type"] = new JArray { "object", "null" },
                    ["additionalProperties"] = true,
                },
                ["cellSize"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 2,
                    ["maxItems"] = 2,
                },
            },
            ["required"] = new JArray { "parentInstanceId", "name", "type" },
            ["additionalProperties"] = false,
        }.AddAnchorPresetProps();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int parentId = @params.Value<int?>("parentInstanceId")
                ?? throw new ToolException("InvalidInput", "'parentInstanceId' is required.");
            var parent = InstanceIdResolver.GameObjectOrThrow(parentId, "parentInstanceId");

            // Mixed-system guard: UGUI content must not live under a UI Toolkit UIDocument.
            UiSystemGuard.AssertNotUnderUIDocument(parent);

            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var typeStr = @params.Value<string>("type");
            if (string.IsNullOrEmpty(typeStr))
                throw new ToolException("InvalidInput", "'type' is required (vertical | horizontal | grid).");

            var paddingToken = @params["padding"];
            var spacingToken = @params["spacing"];
            var alignStr = @params.Value<string>("childAlignment");
            var controlChild = @params["controlChild"] as JObject;
            var cellSizeArr = @params["cellSize"] as JArray;

            // Eager-validate: cellSize only valid for grid.
            if (cellSizeArr != null && typeStr != "grid")
                throw new ToolException("InvalidInput",
                    $"'cellSize' is only valid when type=grid (got type={typeStr}).");

            var paddingRect = ParsePadding(paddingToken);
            TextAnchor? childAlignment = string.IsNullOrEmpty(alignStr) ? null : ParseChildAlignment(alignStr);

            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, worldPositionStays: false);
            var rt = go.GetComponent<RectTransform>();
            // Responsive-by-default: a layout container is the most common place to want an
            // anchor preset (e.g. 'stretch' to fill its parent). No-op when omitted.
            UiToolShared.ApplyOptionalAnchorPreset(rt, @params);

            Component layoutGroupComp;
            switch (typeStr)
            {
                case "vertical":
                {
                    var vlg = go.AddComponent<VerticalLayoutGroup>();
                    vlg.padding = paddingRect;
                    if (spacingToken != null && spacingToken.Type != JTokenType.Null) vlg.spacing = spacingToken.Value<float>();
                    if (childAlignment.HasValue) vlg.childAlignment = childAlignment.Value;
                    ApplyControlChildHorizontalOrVertical(vlg, controlChild);
                    layoutGroupComp = vlg;
                    break;
                }
                case "horizontal":
                {
                    var hlg = go.AddComponent<HorizontalLayoutGroup>();
                    hlg.padding = paddingRect;
                    if (spacingToken != null && spacingToken.Type != JTokenType.Null) hlg.spacing = spacingToken.Value<float>();
                    if (childAlignment.HasValue) hlg.childAlignment = childAlignment.Value;
                    ApplyControlChildHorizontalOrVertical(hlg, controlChild);
                    layoutGroupComp = hlg;
                    break;
                }
                case "grid":
                {
                    var glg = go.AddComponent<GridLayoutGroup>();
                    glg.padding = paddingRect;
                    if (spacingToken != null && spacingToken.Type != JTokenType.Null)
                    {
                        // Grid spacing is a Vector2; expose number as uniform.
                        float s = spacingToken.Value<float>();
                        glg.spacing = new Vector2(s, s);
                    }
                    if (childAlignment.HasValue) glg.childAlignment = childAlignment.Value;
                    if (cellSizeArr != null && cellSizeArr.Count == 2)
                    {
                        glg.cellSize = new Vector2(cellSizeArr[0].Value<float>(), cellSizeArr[1].Value<float>());
                    }
                    layoutGroupComp = glg;
                    break;
                }
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown layout-group type '{typeStr}'. Valid: vertical, horizontal, grid.");
            }

            Undo.RegisterCreatedObjectUndo(go, $"ui_create_layout_group({name})");

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["rectTransformInstanceId"] = rt.GetInstanceID(),
                ["layoutGroupInstanceId"] = layoutGroupComp.GetInstanceID(),
                ["type"] = typeStr,
            }));
        }

        private static RectOffset ParsePadding(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null) return new RectOffset(0, 0, 0, 0);
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
            {
                int uniform = token.Value<int>();
                return new RectOffset(uniform, uniform, uniform, uniform);
            }
            if (token is JObject p)
            {
                // RectOffset(left, right, top, bottom) — Unity's positional order is l/r/t/b.
                int l = p.Value<int?>("l") ?? 0;
                int t = p.Value<int?>("t") ?? 0;
                int r = p.Value<int?>("r") ?? 0;
                int b = p.Value<int?>("b") ?? 0;
                return new RectOffset(l, r, t, b);
            }
            throw new ToolException("InvalidInput",
                "'padding' must be a number (uniform) or object {l, t, r, b} or null.");
        }

        private static TextAnchor ParseChildAlignment(string s)
        {
            // Tolerate dashes / underscores / case: "upper-left" → "UpperLeft".
            var normalized = UiToolShared.NormalizeEnumName(s);
            try
            {
                return (TextAnchor)System.Enum.Parse(typeof(TextAnchor), normalized, ignoreCase: true);
            }
            catch (System.ArgumentException)
            {
                throw new ToolException("InvalidInput",
                    $"'childAlignment' value '{s}' is not a valid TextAnchor (e.g. upper-left, middle-center, lower-right).");
            }
        }

        private static void ApplyControlChildHorizontalOrVertical(HorizontalOrVerticalLayoutGroup lg, JObject controlChild)
        {
            if (controlChild == null) return;
            if (controlChild.TryGetValue("width", out var w)) lg.childControlWidth = w.Value<bool>();
            if (controlChild.TryGetValue("height", out var h)) lg.childControlHeight = h.Value<bool>();
            if (controlChild.TryGetValue("expandWidth", out var ew)) lg.childForceExpandWidth = ew.Value<bool>();
            if (controlChild.TryGetValue("expandHeight", out var eh)) lg.childForceExpandHeight = eh.Value<bool>();
            if (controlChild.TryGetValue("scaleWidth", out var sw)) lg.childScaleWidth = sw.Value<bool>();
            if (controlChild.TryGetValue("scaleHeight", out var sh)) lg.childScaleHeight = sh.Value<bool>();
        }
    }
}
