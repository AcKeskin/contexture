using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Adds a single UI Toolkit element to a document's visual tree and serializes
    /// it back into the <c>.uxml</c> asset (text-level edit + AssetDatabase.ImportAsset,
    /// mirroring <see cref="UitkCreateDocumentTool"/> — Unity's public UXML authoring
    /// API is internal, so we author text and re-import).
    ///
    /// One element type per call via <c>elementType</c> (VisualElement, Label, Button,
    /// TextField, ScrollView, Toggle, …) — mirrors the Unity-Skills convention the agent
    /// already knows. UGUI component types are rejected with InvalidInput naming the
    /// mixed-system violation; the target is also guarded against living under a UGUI
    /// Canvas via <see cref="UiSystemGuard"/>.
    ///
    /// A literal <c>text</c> value is WARNED about (not rejected) — localization-table
    /// authoring is a separate concern, and rejecting would break the common quick-label
    /// flow. The warning is surfaced in the result.
    ///
    /// Parameters:
    /// <list type="bullet">
    ///   <item><term>documentPath</term><description>.uxml asset path to add the element to (required; the document targeting is by asset, not live instance, so the edit round-trips through text).</description></item>
    ///   <item><term>elementType</term><description>UI Toolkit element type name (required) — one of the supported set.</description></item>
    ///   <item><term>name</term><description>Optional element name attribute.</description></item>
    ///   <item><term>class</term><description>Optional list of USS class names.</description></item>
    ///   <item><term>text</term><description>Optional text content (Label/Button/etc.). A literal value warns.</description></item>
    /// </list>
    ///
    /// Returns the document path, the element type added, and (when applicable) a warning.
    /// Undoable / re-import-safe.
    /// </summary>
    [UnityMcpTool("uitk_add_element")]   // ALWAYS-ON: UI Toolkit ships with the editor.
    internal sealed class UitkAddElementTool : IUnityMcpTool
    {
        // Supported UI Toolkit element types (controls + containers). One per call.
        private static readonly HashSet<string> SupportedElements = new HashSet<string>
        {
            "VisualElement", "Label", "Button", "TextField", "ScrollView", "Toggle",
            "Slider", "SliderInt", "Foldout", "ListView", "Box", "Image",
            "DropdownField", "EnumField", "ProgressBar", "RadioButton", "RadioButtonGroup",
            "MinMaxSlider", "IntegerField", "FloatField", "Vector2Field", "Vector3Field",
        };

        // UGUI type names a caller might realistically pass as an elementType by mistake —
        // caught explicitly for a clearer "you're mixing systems" error than the generic
        // "not a supported UITK element". Trimmed to the genuinely confusable names: Unity
        // infrastructure types (RectTransform, CanvasScaler, GraphicRaycaster, layout groups)
        // are never plausible elementType inputs, so they'd only be padding here — the
        // fall-through "not a supported element" branch handles them fine.
        private static readonly HashSet<string> UguiTypes = new HashSet<string>
        {
            "Canvas", "RawImage", "Text", "ScrollRect", "InputField", "Dropdown",
        };

        public string Name => "uitk_add_element";

        public string Description =>
            "Add ONE UI Toolkit element to a .uxml document's visual tree (serialized back " +
            "into the .uxml via AssetDatabase). elementType: VisualElement | Label | Button | " +
            "TextField | ScrollView | Toggle | Slider | Foldout | ListView | … (one per call). " +
            "Rejects UGUI component types (Canvas/Image/Text/etc.) with InvalidInput naming the " +
            "mixed-system violation. A literal 'text' value WARNS (not rejects) — localization is " +
            "a separate concern. Params: documentPath (string, required) — the .uxml; elementType " +
            "(string, required); name (string|null); class (array of strings|null) — USS classes; " +
            "text (string|null). Returns documentPath, elementType, and an optional warning. Undoable.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["documentPath"] = new JObject { ["type"] = "string" },
                ["elementType"] = new JObject { ["type"] = "string" },
                ["name"] = new JObject { ["type"] = new JArray { "string", "null" } },
                ["class"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "string" },
                },
                ["text"] = new JObject { ["type"] = new JArray { "string", "null" } },
            },
            ["required"] = new JArray { "documentPath", "elementType" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            // ------------------------------------------------------------------ validation
            var documentPath = @params.Value<string>("documentPath");
            if (string.IsNullOrEmpty(documentPath))
                throw new ToolException("InvalidInput", "'documentPath' is required and must be non-empty.");
            if (!documentPath.EndsWith(".uxml", System.StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput", "'documentPath' must end with '.uxml'.");
            if (!File.Exists(documentPath))
                throw new ToolException("InvalidInput", $"'documentPath' '{documentPath}' does not exist on disk.");

            var elementType = @params.Value<string>("elementType");
            if (string.IsNullOrEmpty(elementType))
                throw new ToolException("InvalidInput", "'elementType' is required.");

            // ------------------------------------------------------------------ mixed-system reject
            // A UGUI component type here is a UITK/UGUI mixing mistake — name it clearly.
            if (UguiTypes.Contains(elementType) && !SupportedElements.Contains(elementType))
            {
                throw new ToolException("InvalidInput",
                    $"'{elementType}' is a UGUI component, not a UI Toolkit element — UITK and UGUI " +
                    "cannot be mixed within one screen. Use a UGUI tool (ui_create_*/ugui_*) on a " +
                    "Canvas hierarchy, or pick a UI Toolkit element (VisualElement, Label, Button, …).");
            }

            if (!SupportedElements.Contains(elementType))
            {
                throw new ToolException("InvalidInput",
                    $"'{elementType}' is not a supported UI Toolkit element. Supported: " +
                    string.Join(", ", SupportedElements) + ".");
            }

            // ------------------------------------------------------------------ guard live document host
            // If this .uxml is referenced by a UIDocument in the scene, ensure that host is not
            // under a UGUI Canvas (defense-in-depth alongside the type-name reject above).
            GuardLiveDocumentHosts(documentPath);

            // ------------------------------------------------------------------ build the element markup
            var name = @params.Value<string>("name");
            var classToken = @params["class"] as JArray;
            var text = @params.Value<string>("text");

            string warning = null;
            if (!string.IsNullOrEmpty(text))
            {
                // ui-code.md mandates localized strings; warn but do not block the quick-label flow.
                warning = "Literal 'text' set on the element. ui-code.md mandates localized strings — " +
                          "prefer binding/localization once those tools land. Warned, not rejected.";
            }

            var element = BuildElementMarkup(elementType, name, classToken, text);

            // ------------------------------------------------------------------ insert + re-import
            var uxml = File.ReadAllText(documentPath);
            uxml = InsertAsLastChildOfRoot(uxml, element, documentPath);
            File.WriteAllText(documentPath, uxml);
            AssetDatabase.ImportAsset(documentPath);

            var vta = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(documentPath);
            if (vta == null)
                throw new ToolException("InvalidInput",
                    $"Document '{documentPath}' failed to re-import as a VisualTreeAsset after the edit. " +
                    "The element markup may have produced malformed UXML.");

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            var result = new JObject
            {
                ["documentPath"] = documentPath,
                ["elementType"] = elementType,
            };
            if (warning != null)
                result["warning"] = warning;
            return Task.FromResult(ToolResult.Json(result));
        }

        /// <summary>
        /// Builds a single UXML element string: <c>&lt;Type name="..." class="a b" text="..." /&gt;</c>.
        /// Attributes are omitted when not provided. Text is XML-escaped.
        /// </summary>
        private static string BuildElementMarkup(string elementType, string name, JArray classToken, string text)
        {
            var attrs = new List<string>();
            if (!string.IsNullOrEmpty(name))
                attrs.Add($"name=\"{EscapeXmlAttr(name)}\"");

            if (classToken != null && classToken.Count > 0)
            {
                var classes = new List<string>();
                foreach (var c in classToken)
                {
                    var cv = c?.ToString();
                    if (!string.IsNullOrEmpty(cv)) classes.Add(cv);
                }
                if (classes.Count > 0)
                    attrs.Add($"class=\"{EscapeXmlAttr(string.Join(" ", classes))}\"");
            }

            if (!string.IsNullOrEmpty(text))
                attrs.Add($"text=\"{EscapeXmlAttr(text)}\"");

            var attrStr = attrs.Count > 0 ? " " + string.Join(" ", attrs) : string.Empty;
            return $"<ui:{elementType}{attrStr} />";
        }

        /// <summary>
        /// Inserts <paramref name="element"/> just before the closing <c>&lt;/ui:UXML&gt;</c>.
        /// Splits a self-closed empty root open first. Mirrors the text-edit approach used by
        /// uitk_write_uss's Style-link insertion.
        /// </summary>
        private static string InsertAsLastChildOfRoot(string uxml, string element, string documentPath)
        {
            const string closeTag = "</ui:UXML>";
            int closeIdx = uxml.IndexOf(closeTag, System.StringComparison.Ordinal);
            if (closeIdx >= 0)
                return uxml.Substring(0, closeIdx) + element + uxml.Substring(closeIdx);

            // No closing tag — the root may be self-closed "<ui:UXML ... />".
            int openTagEnd = uxml.IndexOf('>');
            if (openTagEnd < 0)
                throw new ToolException("InvalidInput",
                    $"'{documentPath}' is not a well-formed UXML document (no root element found).");

            if (openTagEnd > 0 && uxml[openTagEnd - 1] == '/')
            {
                var head = uxml.Substring(0, openTagEnd - 1).TrimEnd();
                return head + ">" + element + closeTag;
            }

            throw new ToolException("InvalidInput",
                $"'{documentPath}' has an opening UXML tag but no closing </ui:UXML> — cannot safely insert.");
        }

        /// <summary>
        /// If any UIDocument in the loaded scenes references this .uxml, guard its host
        /// GameObject against living under a UGUI Canvas hierarchy.
        /// </summary>
        private static void GuardLiveDocumentHosts(string documentPath)
        {
            var vta = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(documentPath);
            if (vta == null) return; // not yet imported / nothing live to guard

#if UNITY_2023_1_OR_NEWER
            var docs = Object.FindObjectsByType<UIDocument>(FindObjectsSortMode.None);
#else
            var docs = Object.FindObjectsOfType<UIDocument>();
#endif
            foreach (var doc in docs)
            {
                if (doc != null && doc.visualTreeAsset == vta)
                    UiSystemGuard.AssertNotUnderCanvas(doc.gameObject);
            }
        }

        private static string EscapeXmlAttr(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Replace("&", "&amp;")
                    .Replace("\"", "&quot;")
                    .Replace("<", "&lt;")
                    .Replace(">", "&gt;");
        }
    }
}
