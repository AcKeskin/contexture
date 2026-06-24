using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Returns the current Editor selection: the active instanceId plus every selected
    /// instanceId. Reads live Editor state, so a selection made manually in the Hierarchy
    /// or Project window is reflected verbatim — not only one set via editor_select.
    /// Read-only: registers no Undo and marks nothing dirty.
    /// </summary>
    [UnityMcpTool("editor_get_selection")]
    internal sealed class EditorGetSelectionTool : IUnityMcpTool
    {
        public string Name => "editor_get_selection";

        public string Description =>
            "Return the current Editor selection: { activeInstanceId, instanceIds: [...] }. " +
            "Reflects a selection made manually in the Editor, not only one set via " +
            "editor_select. activeInstanceId is 0 when nothing is active. Read-only.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var instanceIds = new JArray();
            foreach (int id in Selection.instanceIDs)
                instanceIds.Add(id);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["activeInstanceId"] = Selection.activeInstanceID,
                ["instanceIds"] = instanceIds,
            }));
        }
    }
}
