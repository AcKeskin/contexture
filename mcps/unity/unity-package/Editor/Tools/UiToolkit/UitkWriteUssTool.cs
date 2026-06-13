using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Writes a USS stylesheet asset for UI Toolkit, validated against the
    /// supported-USS subset before anything touches disk.
    ///
    /// USS looks like CSS but supports only a small subset (flex, transforms,
    /// transitions, border-radius, opacity, CSS variables). Unsupported CSS
    /// (display: grid, box-shadow, z-index, calc(), gradients, @media,
    /// pseudo-elements) parses silently and renders wrong — so this tool rejects
    /// it at the boundary via <see cref="UssSupport"/>, naming the offending
    /// property and its workaround, and writes nothing on violation.
    ///
    /// On success the .uss is written via File.WriteAllText + AssetDatabase.ImportAsset
    /// (Unity owns the .meta / GUID), mirroring <see cref="UitkCreateDocumentTool"/>.
    /// Optionally links the stylesheet into a target document's .uxml via a
    /// &lt;Style src="..."/&gt; element so it applies when the document is loaded.
    ///
    /// Parameters:
    /// <list type="bullet">
    ///   <item><term>path</term><description>Asset path ending in <c>.uss</c>, under <c>Assets/</c> (required).</description></item>
    ///   <item><term>content</term><description>USS text to validate + write (required).</description></item>
    ///   <item><term>documentPath</term><description>Optional .uxml asset path to link the stylesheet into via &lt;Style src&gt;.</description></item>
    /// </list>
    ///
    /// Returns the asset path and GUID, and (when linked) the document path.
    /// The operation is undoable / re-import-safe.
    /// </summary>
    [UnityMcpTool("uitk_write_uss")]   // ALWAYS-ON: UI Toolkit ships with the editor; no Requires guard needed.
    internal sealed class UitkWriteUssTool : IUnityMcpTool
    {
        public string Name => "uitk_write_uss";

        public string Description =>
            "Write a USS stylesheet for UI Toolkit, validated against the supported-USS " +
            "subset FIRST. Rejects unsupported CSS (display: grid, box-shadow, z-index, " +
            "calc(), linear/radial-gradient(), @media, ::before/::after, display: block/inline) " +
            "with InvalidInput naming the property + workaround — the .uss is NOT written on " +
            "violation. Supported subset (flex, transforms, transitions, border-radius, " +
            "opacity, CSS variables) writes via AssetDatabase (Unity owns the .meta/GUID). " +
            "Params: path (string, required) — .uss asset path under Assets/; " +
            "content (string, required) — USS text; documentPath (string|null) — optional " +
            ".uxml to link the stylesheet into via <Style src>. Returns assetPath, guid, and " +
            "(when linked) documentPath.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
                ["content"] = new JObject { ["type"] = "string" },
                ["documentPath"] = new JObject { ["type"] = new JArray { "string", "null" } },
            },
            ["required"] = new JArray { "path", "content" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            // ------------------------------------------------------------------ validation
            var path = @params.Value<string>("path");
            if (string.IsNullOrEmpty(path))
                throw new ToolException("InvalidInput", "'path' is required and must be non-empty.");

            if (!path.EndsWith(".uss", System.StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput", "'path' must end with '.uss'.");

            // content may be empty (an empty stylesheet is valid), but the key must be present.
            var content = @params.Value<string>("content");
            if (content == null)
                throw new ToolException("InvalidInput", "'content' is required (may be an empty string).");

            // ------------------------------------------------------------------ USS subset gate (S2)
            // Authoritative C#-side rejection BEFORE any disk write. uss is not full CSS.
            var violation = UssSupport.Validate(content);
            if (violation != null)
            {
                throw new ToolException("InvalidInput",
                    $"{violation.Property} is not supported in USS — {violation.Workaround}",
                    new JObject
                    {
                        ["property"] = violation.Property,
                        ["workaround"] = violation.Workaround,
                    });
            }

            // ------------------------------------------------------------------ ensure directory
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
                AssetDatabase.Refresh();
            }

            // ------------------------------------------------------------------ write + import (.uss)
            File.WriteAllText(path, content);
            AssetDatabase.ImportAsset(path);

            // Confirm the asset imported as a StyleSheet (catches malformed USS that fails to parse).
            var sheet = AssetDatabase.LoadAssetAtPath<StyleSheet>(path);
            if (sheet == null)
                throw new ToolException("InvalidInput",
                    $"StyleSheet could not be loaded from '{path}' after import. " +
                    "The USS may have a syntax error, or the path is not under Assets/.");

            // ------------------------------------------------------------------ optional <Style src> link
            string linkedDocument = null;
            var documentPath = @params.Value<string>("documentPath");
            if (!string.IsNullOrEmpty(documentPath))
            {
                LinkStylesheetIntoDocument(documentPath, path);
                linkedDocument = documentPath;
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            // ------------------------------------------------------------------ result
            var result = new JObject
            {
                ["assetPath"] = path,
                ["guid"] = AssetDatabase.AssetPathToGUID(path) ?? string.Empty,
            };
            if (linkedDocument != null)
                result["documentPath"] = linkedDocument;
            return Task.FromResult(ToolResult.Json(result));
        }

        /// <summary>
        /// Inserts a <c>&lt;Style src="..."/&gt;</c> element into the target .uxml so the
        /// stylesheet applies when the document is loaded. The src is the project-relative
        /// asset path (UI Toolkit resolves "Assets/..."/"project://" paths). Idempotent:
        /// if a Style element already references this stylesheet, the document is left
        /// untouched. Text-level edit, mirroring the text+ImportAsset authoring approach.
        /// </summary>
        private static void LinkStylesheetIntoDocument(string documentPath, string ussPath)
        {
            if (!documentPath.EndsWith(".uxml", System.StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput", "'documentPath' must end with '.uxml'.");
            if (!File.Exists(documentPath))
                throw new ToolException("InvalidInput", $"'documentPath' '{documentPath}' does not exist on disk.");

            var uxml = File.ReadAllText(documentPath);
            var styleElement = $"<Style src=\"{ussPath}\" />";

            // Idempotency: already linked → nothing to do.
            if (uxml.Contains($"src=\"{ussPath}\""))
                return;

            // Insert the <Style> as the first child inside the root <ui:UXML ...> element.
            // Find the end of the opening UXML tag.
            int openTagEnd = uxml.IndexOf('>');
            if (openTagEnd < 0)
                throw new ToolException("InvalidInput",
                    $"'{documentPath}' is not a well-formed UXML document (no root element found).");

            // Guard against a self-closed empty root "<ui:UXML ... />" — split it open first.
            if (openTagEnd > 0 && uxml[openTagEnd - 1] == '/')
            {
                // "<ui:UXML ... />"  →  "<ui:UXML ...></ui:UXML>"
                var head = uxml.Substring(0, openTagEnd - 1).TrimEnd();
                uxml = head + ">" + styleElement + "</ui:UXML>";
            }
            else
            {
                uxml = uxml.Substring(0, openTagEnd + 1) + styleElement + uxml.Substring(openTagEnd + 1);
            }

            File.WriteAllText(documentPath, uxml);
            AssetDatabase.ImportAsset(documentPath);
        }
    }
}
