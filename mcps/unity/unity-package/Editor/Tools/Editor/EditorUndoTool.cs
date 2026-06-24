using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Reverses the most recent registered Undo step. Delegates the mechanics to
    /// <see cref="EditorUndoRedo.Perform"/> (the single owner of the undo/redo logic).
    /// CALLS the undo stack — it does not register onto it — so it marks nothing dirty and
    /// adds no Undo entry of its own. The peeked group name is best-effort context only;
    /// the { undone: true } ack is the contract.
    /// </summary>
    [UnityMcpTool("editor_undo")]
    internal sealed class EditorUndoTool : IUnityMcpTool
    {
        public string Name => "editor_undo";

        public string Description =>
            "Reverse the most recent registered Undo step (equivalent to Edit/Undo). " +
            "Returns { undone: true, undoneGroup? }. undoneGroup is a best-effort name of " +
            "the undo group and may be absent or approximate; the undone:true ack is the " +
            "contract. Safe no-op when the undo stack is empty. Registers no Undo, marks " +
            "nothing dirty.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject(),
            ["required"] = new JArray(),
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            return Task.FromResult(ToolResult.Json(EditorUndoRedo.Perform(redo: false)));
        }
    }
}
