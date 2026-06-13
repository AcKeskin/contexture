using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Toggles a GameObject's activeSelf state. Inactive GameObjects don't render or tick.
    /// Registers Undo.
    /// </summary>
    [UnityMcpTool("go_set_active")]
    internal sealed class GoSetActiveTool : IUnityMcpTool
    {
        public string Name => "go_set_active";

        public string Description =>
            "Set a GameObject's activeSelf state. Inactive GameObjects don't render or tick. " +
            "Note: activeInHierarchy may stay false if any parent is inactive. Registers Undo.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["active"] = new JObject { ["type"] = "boolean" },
            },
            ["required"] = new JArray { "instanceId", "active" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");
            bool active = @params.Value<bool?>("active")
                ?? throw new ArgumentException("'active' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            Undo.RecordObject(go, "Unity MCP: Set Active");
            go.SetActive(active);
            EditorUtility.SetDirty(go);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["activeSelf"] = go.activeSelf,
                ["activeInHierarchy"] = go.activeInHierarchy,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
