using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Re-applies the most recently undone step. Delegates the mechanics to
    /// <see cref="EditorUndoRedo.Perform"/> (the single owner of the undo/redo logic).
    /// CALLS the undo stack — it does not register onto it — so it marks nothing dirty and
    /// adds no Undo entry of its own. The peeked group name is best-effort context only;
    /// the { redone: true } ack is the contract.
    /// </summary>
    [UnityMcpTool("editor_redo")]
    internal sealed class EditorRedoTool : IUnityMcpTool
    {
        public string Name => "editor_redo";

        public string Description =>
            "Re-apply the most recently undone step (equivalent to Edit/Redo). Returns " +
            "{ redone: true, redoneGroup? }. redoneGroup is a best-effort name and may be " +
            "absent or approximate; the redone:true ack is the contract. Safe no-op when " +
            "there is nothing to redo. Registers no Undo, marks nothing dirty.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            return Task.FromResult(ToolResult.Json(EditorUndoRedo.Perform(redo: true)));
        }
    }
}
