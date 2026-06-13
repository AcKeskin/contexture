using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace UnityMcp.Editor.Tools.UiToolkit
{
    /// <summary>
    /// Creates a minimal UI Toolkit document: writes a valid <c>.uxml</c> asset via
    /// <c>File.WriteAllText</c> + <c>AssetDatabase.ImportAsset</c> (Unity owns the
    /// <c>.meta</c> / GUID generation), then creates a <see cref="GameObject"/> with a
    /// <see cref="UIDocument"/> component referencing that asset.
    ///
    /// Parameters:
    /// <list type="bullet">
    ///   <item><term>name</term><description>Element / document name (required).</description></item>
    ///   <item><term>path</term><description>Asset path ending in <c>.uxml</c>, under <c>Assets/</c> (required).</description></item>
    ///   <item><term>parentInstanceId</term><description>Optional parent GameObject instance-id. When present the UIDocument host is parented there.</description></item>
    ///   <item><term>panelSettingsPath</term><description>Optional asset path of a <see cref="PanelSettings"/> to assign to <c>UIDocument.panelSettings</c>.</description></item>
    /// </list>
    ///
    /// Returns instanceId of the host GameObject, instanceId of the UIDocument component,
    /// instanceId of the imported VisualTreeAsset, the asset path, and the GUID assigned
    /// by AssetDatabase.
    ///
    /// The operation is undoable. Do not hand-create a <c>.meta</c> — Unity generates it
    /// during ImportAsset.
    /// </summary>
    [UnityMcpTool("uitk_create_document")]   // ALWAYS-ON: UI Toolkit ships with the editor; no Requires guard needed.
    internal sealed class UitkCreateDocumentTool : IUnityMcpTool
    {
        public string Name => "uitk_create_document";

        public string Description =>
            "Create a UI Toolkit document: writes a minimal valid .uxml asset via " +
            "File.WriteAllText + AssetDatabase.ImportAsset (Unity owns the .meta/GUID), " +
            "then creates a GameObject with a UIDocument component referencing it. " +
            "Params: name (string, required) — element/document name; " +
            "path (string, required) — asset path ending in .uxml under Assets/; " +
            "parentInstanceId (integer|null) — optional parent GameObject; " +
            "panelSettingsPath (string|null) — optional PanelSettings asset path. " +
            "Returns instanceId, uiDocumentInstanceId, visualTreeAssetInstanceId, " +
            "assetPath, and guid. Operation is undoable.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["name"] = new JObject { ["type"] = "string" },
                ["path"] = new JObject { ["type"] = "string" },
                ["parentInstanceId"] = new JObject { ["type"] = new JArray { "integer", "null" } },
                ["panelSettingsPath"] = new JObject { ["type"] = new JArray { "string", "null" } },
            },
            ["required"] = new JArray { "name", "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            // ------------------------------------------------------------------ validation
            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var path = @params.Value<string>("path");
            if (string.IsNullOrEmpty(path))
                throw new ToolException("InvalidInput", "'path' is required and must be non-empty.");

            if (!path.EndsWith(".uxml", System.StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput", "'path' must end with '.uxml'.");

            // ------------------------------------------------------------------ ensure directory
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
                AssetDatabase.Refresh();
            }

            // ------------------------------------------------------------------ write minimal UXML
            const string uxml =
                "<ui:UXML xmlns:ui=\"UnityEngine.UIElements\" " +
                "xmlns:uie=\"UnityEditor.UIElements\">" +
                "</ui:UXML>";
            File.WriteAllText(path, uxml);
            AssetDatabase.ImportAsset(path);

            // ------------------------------------------------------------------ load imported asset
            var vta = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(path);
            if (vta == null)
                throw new ToolException("InvalidInput",
                    $"VisualTreeAsset could not be loaded from '{path}' after import. " +
                    "Verify that the path is under Assets/ and that the project compiles.");

            // ------------------------------------------------------------------ optional parent
            var parentToken = @params["parentInstanceId"];
            int? parentId = parentToken != null && parentToken.Type != JTokenType.Null
                ? parentToken.Value<int?>()
                : null;

            GameObject parent = null;
            if (parentId.HasValue)
                parent = InstanceIdResolver.GameObjectOrThrow(parentId.Value, "parentInstanceId");

            // Guard against mixing UITK into a UGUI Canvas hierarchy.
            UiSystemGuard.AssertNotUnderCanvas(parent);

            // ------------------------------------------------------------------ create host GameObject
            var go = new GameObject(name);
            if (parent != null)
                go.transform.SetParent(parent.transform, worldPositionStays: false);

            // ------------------------------------------------------------------ add UIDocument
            var doc = go.AddComponent<UIDocument>();
            doc.visualTreeAsset = vta;

            // ------------------------------------------------------------------ optional PanelSettings
            var panelSettingsPath = @params.Value<string>("panelSettingsPath");
            if (!string.IsNullOrEmpty(panelSettingsPath))
            {
                var ps = AssetDatabase.LoadAssetAtPath<PanelSettings>(panelSettingsPath);
                if (ps == null)
                    throw new ToolException("InvalidInput",
                        $"PanelSettings could not be loaded from '{panelSettingsPath}'. " +
                        "Verify the path points to a valid PanelSettings asset.");
                doc.panelSettings = ps;
            }

            // ------------------------------------------------------------------ undo + finalize
            Undo.RegisterCreatedObjectUndo(go, $"uitk_create_document({name})");

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            // ------------------------------------------------------------------ result
            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["uiDocumentInstanceId"] = doc.GetInstanceID(),
                ["visualTreeAssetInstanceId"] = vta.GetInstanceID(),
                ["assetPath"] = path,
                ["guid"] = AssetDatabase.AssetPathToGUID(path) ?? string.Empty,
            }));
        }
    }
}
