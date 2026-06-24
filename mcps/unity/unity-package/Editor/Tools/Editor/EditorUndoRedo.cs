using Newtonsoft.Json.Linq;
using UnityEditor;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Shared undo/redo mechanics for <see cref="EditorUndoTool"/> and
    /// <see cref="EditorRedoTool"/>. Peeks the current undo group name (best-effort
    /// context) and drives the undo stack. CALLS the stack — registers no Undo of its own
    /// and marks nothing dirty.
    /// </summary>
    internal static class EditorUndoRedo
    {
        /// <summary>
        /// Performs an undo (<paramref name="redo"/> false) or redo (true). Returns
        /// { &lt;ackKey&gt;: true, &lt;groupKey&gt;?: &lt;name&gt; } where ackKey/groupKey are
        /// "undone"/"undoneGroup" or "redone"/"redoneGroup". The group name is omitted when
        /// empty; the ack is always present and is the contract.
        /// </summary>
        public static JObject Perform(bool redo)
        {
            string ackKey = redo ? "redone" : "undone";
            string groupKey = redo ? "redoneGroup" : "undoneGroup";

            string group = Undo.GetCurrentGroupName();
            if (redo) Undo.PerformRedo();
            else Undo.PerformUndo();

            var result = new JObject { [ackKey] = true };
            if (!string.IsNullOrEmpty(group))
                result[groupKey] = group;

            return result;
        }
    }
}
