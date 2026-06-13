using System;
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
    /// Composite factory for a UGUI Button. Creates a GameObject hierarchy under
    /// <c>parentInstanceId</c> (the Canvas or container) in one call:
    /// <list type="bullet">
    ///   <item>Root GO: RectTransform + Image (background) + Button</item>
    ///   <item>Child GO: RectTransform + TextMeshProUGUI (preferred) or legacy
    ///   Text (fallback) — label that fills the button rect.</item>
    /// </list>
    ///
    /// TMP resolution follows the same reflection strategy as
    /// <see cref="UiCreateTextTool"/>: types are loaded from the
    /// <c>Unity.TextMeshPro</c> assembly at runtime so no hard asmdef reference
    /// is required. If TMP is unavailable or has no default font, the tool falls
    /// back to legacy <c>UnityEngine.UI.Text</c> and includes a
    /// <c>warning</c> field in the result — it does NOT throw.
    ///
    /// Raycast hygiene: the label graphic has <c>raycastTarget = false</c> so
    /// the clickable surface remains the background Image only.
    ///
    /// The Button's <c>targetGraphic</c> is wired to the background Image.
    /// </summary>
    [UnityMcpTool("ugui_create_button", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UguiCreateButtonTool : IUnityMcpTool
    {
        // Cached TMP type — resolved once via the shared TmpReflection helper.
        private static Type _tTmpUgui;       // TMPro.TextMeshProUGUI
        private static bool _tmpResolved;    // whether resolution has been attempted

        public string Name => "ugui_create_button";

        public string Description =>
            "PREFER THIS over go_create + component_add×2 + child GO + label setup for " +
            "any UGUI Button. Creates: root GO (RectTransform + Image + Button) + child " +
            "label GO (RectTransform + TextMeshProUGUI preferred, legacy Text fallback). " +
            "Background Image is the raycast target; label raycastTarget is disabled. " +
            "Button.targetGraphic is wired to the Image. " +
            "parentInstanceId is required (must be inside a Canvas hierarchy). " +
            "Returns instanceIds for the GO, RectTransform, Image, Button, label GO, " +
            "label component, plus labelType ('TextMeshProUGUI' | 'Text') and an " +
            "optional 'warning' when the legacy fallback was used.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["parentInstanceId"] = new JObject { ["type"] = "integer" },
                ["name"] = new JObject { ["type"] = "string" },
                ["label"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["color"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 4,
                },
                ["width"] = new JObject { ["type"] = new JArray { "number", "null" } },
                ["height"] = new JObject { ["type"] = new JArray { "number", "null" } },
            },
            ["required"] = new JArray { "parentInstanceId", "name" },
            ["additionalProperties"] = false,
        }.AddAnchorPresetProps();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            // --- Input validation ---
            int parentId = @params.Value<int?>("parentInstanceId")
                ?? throw new ToolException("InvalidInput", "'parentInstanceId' is required.");
            var parent = InstanceIdResolver.GameObjectOrThrow(parentId, "parentInstanceId");

            // Mixed-system guard: UGUI content must not live under a UI Toolkit UIDocument.
            UiSystemGuard.AssertNotUnderUIDocument(parent);

            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var labelText = @params.Value<string>("label") ?? "Button";
            var colorArr = @params["color"] as JArray;
            float width = @params["width"]?.Type == JTokenType.Float || @params["width"]?.Type == JTokenType.Integer
                ? @params.Value<float>("width")
                : 160f;
            float height = @params["height"]?.Type == JTokenType.Float || @params["height"]?.Type == JTokenType.Integer
                ? @params.Value<float>("height")
                : 30f;

            // --- Root button GO ---
            var buttonGo = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            buttonGo.transform.SetParent(parent.transform, worldPositionStays: false);

            var rt = buttonGo.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(width, height);

            // Responsive-by-default: an explicit anchorPreset overrides the fixed sizeDelta
            // above with anchor-based placement (the fixed size is the fallback, not the goal).
            UiToolShared.ApplyOptionalAnchorPreset(rt, @params);

            // --- Background Image ---
            var image = buttonGo.GetComponent<Image>();
            var parsedColor = UiToolShared.ParseColor(colorArr);
            if (parsedColor.HasValue)
                image.color = parsedColor.Value;
            // raycastTarget stays true on the Image — it is the clickable surface.

            // --- Wire Button.targetGraphic ---
            var button = buttonGo.GetComponent<Button>();
            button.targetGraphic = image;

            // --- Child label GO (fills button rect) ---
            var labelGo = new GameObject(name + "_Label", typeof(RectTransform));
            labelGo.transform.SetParent(buttonGo.transform, worldPositionStays: false);

            var labelRt = labelGo.GetComponent<RectTransform>();
            labelRt.anchorMin = Vector2.zero;
            labelRt.anchorMax = Vector2.one;
            labelRt.offsetMin = Vector2.zero;
            labelRt.offsetMax = Vector2.zero;

            // --- Label component: TMP preferred, legacy Text fallback ---
            string labelType;
            int labelComponentInstanceId;
            string warning = null;

            if (TryAddTmpLabel(labelGo, labelText, out var tmpComponent))
            {
                labelType = "TextMeshProUGUI";
                labelComponentInstanceId = tmpComponent.GetInstanceID();
            }
            else
            {
                // Legacy fallback — never throw, surface a warning instead.
                warning = "TextMeshPro is unavailable or has no default font asset. " +
                          "The label was created with legacy UnityEngine.UI.Text. " +
                          "Import TMP Essentials via Window/TextMeshPro/Import TMP Essential Resources " +
                          "and recreate the button to use TextMeshProUGUI.";
                var legacyText = AddLegacyLabel(labelGo, labelText);
                labelType = "Text";
                labelComponentInstanceId = legacyText.GetInstanceID();
            }

            // --- Undo (root covers the whole hierarchy created in this frame) ---
            Undo.RegisterCreatedObjectUndo(buttonGo, $"ugui_create_button({name})");

            // --- Result ---
            var result = new JObject
            {
                ["instanceId"]                 = buttonGo.GetInstanceID(),
                ["rectTransformInstanceId"]    = rt.GetInstanceID(),
                ["imageInstanceId"]            = image.GetInstanceID(),
                ["buttonInstanceId"]           = button.GetInstanceID(),
                ["labelInstanceId"]            = labelGo.GetInstanceID(),
                ["labelComponentInstanceId"]   = labelComponentInstanceId,
                ["labelType"]                  = labelType,
            };
            if (warning != null)
                result["warning"] = warning;

            return Task.FromResult(ToolResult.Json(result));
        }

        // -------------------------------------------------------------------------
        // TMP helpers — soft resolution (returns false instead of throwing so the
        // caller can fall back to legacy Text gracefully).
        // -------------------------------------------------------------------------

        /// <summary>
        /// Attempts to add a TextMeshProUGUI component to <paramref name="go"/>.
        /// Returns <c>true</c> and sets <paramref name="component"/> on success.
        /// Returns <c>false</c> silently if TMP is unavailable or has no default font.
        /// </summary>
        private static bool TryAddTmpLabel(GameObject go, string text, out Component component)
        {
            component = null;

            if (!EnsureTmpTypeResolved())
                return false;

            // Verify a default font is available; without it TMP text is invisible
            // and the user gets a confusing blank button with no error.
            var defaultFont = TmpReflection.GetDefaultFontOrNull();
            if (defaultFont == null)
                return false;

            try
            {
                var tmp = go.AddComponent(_tTmpUgui);
                TmpReflection.SetMember(tmp, "text", text, Tag);
                TmpReflection.SetMember(tmp, "color", Color.black, Tag);
                TmpReflection.SetMember(tmp, "raycastTarget", false, Tag);

                // Center alignment — parse "Center" from the TMP enum.
                var alignmentCenter = TmpReflection.ParseEnum("TextAlignmentOptions", "Center");
                if (alignmentCenter != null)
                    TmpReflection.SetMember(tmp, "alignment", alignmentCenter, Tag);

                TmpReflection.SetMember(tmp, "font", defaultFont, Tag);

                component = tmp;
                return true;
            }
            catch (Exception ex)
            {
                // Unexpected reflection failure — degrade gracefully.
                Debug.LogWarning($"[{Tag}] TMP component setup failed, falling back to legacy Text. {ex.Message}");
                return false;
            }
        }

        private const string Tag = "ugui_create_button";

        /// <summary>
        /// Resolves the TextMeshProUGUI type via the shared <see cref="TmpReflection"/> helper.
        /// Returns <c>true</c> when present; caches the result so subsequent calls are free.
        /// </summary>
        private static bool EnsureTmpTypeResolved()
        {
            if (_tmpResolved) return _tTmpUgui != null;
            _tTmpUgui = TmpReflection.ResolveType("TextMeshProUGUI");
            _tmpResolved = true;
            return _tTmpUgui != null;
        }

        // -------------------------------------------------------------------------
        // Legacy Text fallback
        // -------------------------------------------------------------------------

        private static Text AddLegacyLabel(GameObject go, string text)
        {
            var t = go.AddComponent<Text>();
            t.text = text;
            t.alignment = TextAnchor.MiddleCenter;
            t.color = Color.black;
            t.raycastTarget = false;

            // Unity 2022+ built-in font name; fall back to "Arial.ttf" for older versions.
            Font builtinFont = null;
            try { builtinFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } catch { /* tolerate */ }
            if (builtinFont == null)
            {
                try { builtinFont = Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch { /* tolerate */ }
            }
            if (builtinFont != null)
                t.font = builtinFont;

            return t;
        }
    }
}
