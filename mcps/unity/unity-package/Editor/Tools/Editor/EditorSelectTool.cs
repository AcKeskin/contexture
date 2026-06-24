using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor.Tools.Editor
{
    /// <summary>
    /// Sets the Editor selection to one or more objects addressed by instanceId, optionally
    /// framing them in the Scene view and/or pinging them in the Project window. Works on
    /// scene objects AND Project assets (selection resolution goes through
    /// <see cref="InstanceIdResolver.ObjectOrThrow"/>).
    ///
    /// Deliberately registers NO Undo and marks NOTHING dirty: changing
    /// <c>Selection.objects</c> is not a scene/asset mutation Unity treats as undoable.
    /// </summary>
    [UnityMcpTool("editor_select")]
    internal sealed class EditorSelectTool : IUnityMcpTool
    {
        public string Name => "editor_select";

        public string Description =>
            "Set the Editor selection to one or more objects by instanceId. Required: " +
            "'instanceIds' (int[], at least one). Optional 'frame' (default false) frames " +
            "the selection in the Scene view; 'ping' (default false) pings the active " +
            "object in the Project window. Works on scene objects and Project assets. " +
            "Returns { selected: [instanceId...], framed, pinged }. framed is false (not an " +
            "error) when no Scene view is open. Throws ToolException('InvalidInput') for an " +
            "instanceId that doesn't resolve. Registers no Undo and marks nothing dirty.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceIds"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "integer" },
                    ["minItems"] = 1,
                    ["description"] = "instanceIds to select. Scene objects or Project assets.",
                },
                ["frame"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = false,
                },
                ["ping"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = false,
                },
            },
            ["required"] = new JArray { "instanceIds" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var instanceIdsArray = @params["instanceIds"] as JArray;
            if (instanceIdsArray == null || instanceIdsArray.Count == 0)
                throw new ToolException("InvalidInput", "'instanceIds' is required and must contain at least one id.");

            bool frame = @params["frame"]?.Value<bool>() ?? false;
            bool ping = @params["ping"]?.Value<bool>() ?? false;

            // Resolve every id BEFORE mutating Selection, so a bad id leaves selection untouched.
            var resolved = new UnityEngine.Object[instanceIdsArray.Count];
            var selectedIds = new JArray();
            for (int i = 0; i < instanceIdsArray.Count; i++)
            {
                int id = instanceIdsArray[i].Value<int>();
                resolved[i] = InstanceIdResolver.ObjectOrThrow(id);
                selectedIds.Add(id);
            }

            Selection.objects = resolved;
            Selection.activeObject = resolved[0];

            bool framed = false;
            if (frame && SceneView.lastActiveSceneView != null)
            {
                SceneView.FrameLastActiveSceneView();
                framed = true;
            }

            bool pinged = false;
            if (ping)
            {
                EditorGUIUtility.PingObject(Selection.activeObject);
                pinged = true;
            }

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["selected"] = selectedIds,
                ["framed"] = framed,
                ["pinged"] = pinged,
            }));
        }
    }
}
