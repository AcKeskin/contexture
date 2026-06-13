using System;
using System.Reflection;
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
    /// Composite factory for a TextMeshProUGUI text element. Creates a
    /// GameObject under <c>parentInstanceId</c> with RectTransform +
    /// TextMeshProUGUI configured from the supplied params, with sensible
    /// defaults pulled from TMP_Settings.
    ///
    /// TMP types are resolved via reflection (assembly <c>Unity.TextMeshPro</c>)
    /// to avoid a hard asmdef reference on a package that is technically
    /// optional. If TMP isn't initialized in the project (no default font
    /// asset) and no <c>font</c> param is supplied, the tool fails fast with
    /// a message pointing at TMP Essentials import.
    /// </summary>
    [UnityMcpTool("ui_create_text", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UiCreateTextTool : IUnityMcpTool
    {
        private const string TmpAsm = "Unity.TextMeshPro";
        private static Type _tTmpUgui;       // TMPro.TextMeshProUGUI
        private static Type _tTmpSettings;   // TMPro.TMP_Settings
        private static Type _tTmpFontAsset;  // TMPro.TMP_FontAsset
        private static Type _tAlignmentOptions; // TMPro.TextAlignmentOptions

        public string Name => "ui_create_text";

        public string Description =>
            "Create a GameObject with RectTransform + TextMeshProUGUI in one call. " +
            "Configures text, autosize, alignment (case/dash-insensitive enum name), " +
            "color [r,g,b,a], font (instanceId or asset path; defaults to TMP_Settings.defaultFontAsset). " +
            "Optional layoutElement: { minWidth?, minHeight?, preferredWidth?, preferredHeight?, " +
            "flexibleWidth?, flexibleHeight? } adds + configures a LayoutElement. parentInstanceId " +
            "is required. If TMP isn't initialized (no default font), tool fails with InvalidInput " +
            "pointing at Window/TextMeshPro/Import TMP Essential Resources.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["parentInstanceId"] = new JObject { ["type"] = "integer" },
                ["name"] = new JObject { ["type"] = "string" },
                ["text"] = new JObject { ["type"] = "string" },
                ["autosize"] = new JObject { ["type"] = new JArray { "boolean", "null" } },
                ["alignment"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["color"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 4,
                },
                ["font"] = new JObject { ["type"] = new JArray { "integer", "string", "null" } },
                ["layoutElement"] = new JObject
                {
                    ["type"] = new JArray { "object", "null" },
                    ["additionalProperties"] = true,
                },
            },
            ["required"] = new JArray { "parentInstanceId", "name", "text" },
            ["additionalProperties"] = false,
        }.AddAnchorPresetProps();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            ResolveTmpTypes();

            int parentId = @params.Value<int?>("parentInstanceId")
                ?? throw new ToolException("InvalidInput", "'parentInstanceId' is required.");
            var parent = InstanceIdResolver.GameObjectOrThrow(parentId, "parentInstanceId");

            // Mixed-system guard: UGUI content must not live under a UI Toolkit UIDocument.
            UiSystemGuard.AssertNotUnderUIDocument(parent);

            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var text = @params.Value<string>("text") ?? string.Empty;
            bool autosize = @params["autosize"]?.Type == JTokenType.Boolean && @params.Value<bool>("autosize");
            var alignmentStr = @params.Value<string>("alignment");
            var colorArr = @params["color"] as JArray;
            var fontToken = @params["font"];
            var layoutElementParams = @params["layoutElement"] as JObject;

            // Resolve font BEFORE constructing the GameObject so we can fail early
            // with a clean message rather than leaving an orphan GO behind.
            UnityEngine.Object font = ResolveFont(fontToken);

            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, worldPositionStays: false);

            var rt = go.GetComponent<RectTransform>();
            // Default rect size matches Unity's "GameObject/UI/Text - TextMeshPro" menu shape.
            rt.sizeDelta = new Vector2(200, 50);
            // Responsive-by-default: an explicit anchorPreset overrides the fixed default rect.
            UiToolShared.ApplyOptionalAnchorPreset(rt, @params);

            // Add TextMeshProUGUI via reflection.
            var tmp = go.AddComponent(_tTmpUgui);

            // text
            SetProperty(tmp, "text", text);

            // autosize
            SetProperty(tmp, "enableAutoSizing", autosize);

            // alignment
            if (!string.IsNullOrEmpty(alignmentStr))
            {
                var enumValue = ParseAlignment(alignmentStr);
                SetProperty(tmp, "alignment", enumValue);
            }

            // color
            var parsedColor = UiToolShared.ParseColor(colorArr);
            if (parsedColor.HasValue)
            {
                SetProperty(tmp, "color", parsedColor.Value);
            }

            // font
            if (font != null)
            {
                SetProperty(tmp, "font", font);
            }

            // Optional LayoutElement
            int? layoutElementInstanceId = null;
            if (layoutElementParams != null)
            {
                var le = go.AddComponent<LayoutElement>();
                UiToolShared.ApplyLayoutElementParams(le, layoutElementParams);
                layoutElementInstanceId = le.GetInstanceID();
            }

            Undo.RegisterCreatedObjectUndo(go, $"ui_create_text({name})");

            var result = new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["rectTransformInstanceId"] = rt.GetInstanceID(),
                ["textComponentInstanceId"] = tmp.GetInstanceID(),
            };
            if (layoutElementInstanceId.HasValue)
                result["layoutElementInstanceId"] = layoutElementInstanceId.Value;
            return Task.FromResult(ToolResult.Json(result));
        }

        private static void ResolveTmpTypes()
        {
            if (_tTmpUgui != null) return;
            _tTmpUgui = Type.GetType($"TMPro.TextMeshProUGUI, {TmpAsm}", throwOnError: false);
            _tTmpSettings = Type.GetType($"TMPro.TMP_Settings, {TmpAsm}", throwOnError: false);
            _tTmpFontAsset = Type.GetType($"TMPro.TMP_FontAsset, {TmpAsm}", throwOnError: false);
            _tAlignmentOptions = Type.GetType($"TMPro.TextAlignmentOptions, {TmpAsm}", throwOnError: false);
            if (_tTmpUgui == null || _tTmpSettings == null || _tTmpFontAsset == null || _tAlignmentOptions == null)
            {
                throw new ToolException("InvalidInput",
                    "TextMeshPro types not found. Install com.unity.textmeshpro (it ships in default Unity 2022+ projects).");
            }
        }

        private static UnityEngine.Object ResolveFont(JToken fontToken)
        {
            if (fontToken == null || fontToken.Type == JTokenType.Null)
                return GetDefaultFontOrThrow();

            if (fontToken.Type == JTokenType.Integer)
            {
                var obj = EditorUtility.InstanceIDToObject(fontToken.Value<int>());
                if (obj == null || !_tTmpFontAsset.IsAssignableFrom(obj.GetType()))
                    throw new ToolException("InvalidInput",
                        $"'font' instanceId {fontToken.Value<int>()} did not resolve to a TMP_FontAsset.");
                return obj;
            }
            if (fontToken.Type == JTokenType.String)
            {
                var path = fontToken.Value<string>();
                var asset = AssetDatabase.LoadAssetAtPath(path, _tTmpFontAsset);
                if (asset == null)
                    throw new ToolException("InvalidInput",
                        $"'font' asset path '{path}' did not load as a TMP_FontAsset.");
                return asset;
            }
            throw new ToolException("InvalidInput", "'font' must be an integer (instanceId), a string (asset path), or null.");
        }

        private static UnityEngine.Object GetDefaultFontOrThrow()
        {
            // TMP_Settings.defaultFontAsset is a static property on the TMP_Settings type.
            var prop = _tTmpSettings.GetProperty("defaultFontAsset", BindingFlags.Public | BindingFlags.Static);
            var defaultFont = prop?.GetValue(null) as UnityEngine.Object;
            if (defaultFont == null)
                throw new ToolException("InvalidInput",
                    "TMP not initialized — no default font asset. Import TMP Essentials via Window/TextMeshPro/Import TMP Essential Resources, or pass an explicit 'font' instanceId/path.");
            return defaultFont;
        }

        private static object ParseAlignment(string s)
        {
            // Tolerate case + dash/camel. "top-left" → "TopLeft", "TopLeft" → "TopLeft", "topleft" → "TopLeft".
            var normalized = UiToolShared.NormalizeEnumName(s);
            try
            {
                return Enum.Parse(_tAlignmentOptions, normalized, ignoreCase: true);
            }
            catch (ArgumentException)
            {
                throw new ToolException("InvalidInput",
                    $"'alignment' value '{s}' is not a valid TextAlignmentOptions name (e.g. Left, Center, Right, TopLeft, MidlineCenter).");
            }
        }

        // Reflection member-set delegates to the shared TmpReflection helper (the second
        // caller alongside ugui_create_button — the extraction earns its keep here).
        private static void SetProperty(Component target, string propName, object value)
            => TmpReflection.SetMember(target, propName, value, "ui_create_text");

    }
}
