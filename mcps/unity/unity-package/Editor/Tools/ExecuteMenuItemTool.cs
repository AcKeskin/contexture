using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Invokes any registered Unity menu item by its full menu path (e.g.
    /// <c>"Tools/UnityMCP/Validate Mrtk3 Knowledge Corpus"</c>). Wraps
    /// <see cref="EditorApplication.ExecuteMenuItem"/>.
    ///
    /// Use cases an agent commonly hits:
    /// - Running custom validator / generator menus exposed by the project
    ///   or by other Unity packages.
    /// - Triggering Window menu items (e.g. <c>"Window/Package Manager"</c>).
    /// - Running build / asset / animation menu items that have no dedicated
    ///   MCP tool yet.
    /// - Creating GameObjects via the <c>GameObject/UI/*</c> or
    ///   <c>GameObject/3D Object/*</c> menus and capturing the new instanceId
    ///   from <c>createdInstanceIds</c> (see below).
    ///
    /// <c>EditorApplication.ExecuteMenuItem</c> returns a bool — true when
    /// the path resolves and the item invokes, false otherwise. We surface
    /// that bool plus the path attempted so the caller can distinguish
    /// "menu didn't exist" from "menu existed and ran (effects are on the
    /// Editor's side; this tool doesn't echo them)".
    ///
    /// Heuristic <c>createdInstanceIds</c>: Unity's <c>GameObject/*</c> menus
    /// auto-select the new object after creation. We diff
    /// <see cref="Selection.activeGameObject"/> before and after the menu
    /// call; if the active GameObject changed to one that didn't exist
    /// before, its instanceId surfaces. Menus that don't auto-select (window
    /// toggles, validators) return an empty array. The field is always
    /// present so callers can branch on its length.
    /// </summary>
    [UnityMcpTool("execute_menu_item")]
    internal sealed class ExecuteMenuItemTool : IUnityMcpTool
    {
        public string Name => "execute_menu_item";

        public string Description =>
            "Invoke any Unity menu item by its full menu path (e.g. 'Tools/UnityMCP/" +
            "Validate Mrtk3 Knowledge Corpus' or 'Window/Package Manager'). Returns " +
            "{ menuItem, executed: true|false, createdInstanceIds: [int] }. " +
            "executed=false means the menu path didn't resolve to any registered " +
            "MenuItem. createdInstanceIds is populated via a Selection.activeGameObject " +
            "diff: for 'GameObject/*' creator menus (which auto-select the new object), " +
            "the new instanceId appears in the array. For menus that don't auto-select " +
            "(window toggles, validators, Edit/* commands), the array is empty. The " +
            "array is always present in the response.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["menuItem"] = new JObject
                {
                    ["type"] = "string",
                    ["description"] = "Full menu path, slash-separated. Case-sensitive.",
                },
            },
            ["required"] = new JArray { "menuItem" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var menuItem = @params.Value<string>("menuItem");
            if (string.IsNullOrWhiteSpace(menuItem))
                throw new ToolException("InvalidInput", "'menuItem' is required and must be non-empty.");

            var beforeSelection = Selection.activeGameObject;
            int beforeId = beforeSelection != null ? beforeSelection.GetInstanceID() : 0;

            bool executed = EditorApplication.ExecuteMenuItem(menuItem);

            var afterSelection = Selection.activeGameObject;
            int afterId = afterSelection != null ? afterSelection.GetInstanceID() : 0;

            var createdInstanceIds = new JArray();
            if (executed && afterSelection != null && afterId != beforeId)
                createdInstanceIds.Add(afterId);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["menuItem"] = menuItem,
                ["executed"] = executed,
                ["createdInstanceIds"] = createdInstanceIds,
            }));
        }
    }
}
