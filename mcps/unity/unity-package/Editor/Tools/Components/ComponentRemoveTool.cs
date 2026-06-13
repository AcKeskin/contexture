using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Removes a Component by its instance ID. Refuses to remove Transform (Unity disallows
    /// removing the only built-in component every GameObject must have). Registers Undo.
    /// </summary>
    [UnityMcpTool("component_remove")]
    internal sealed class ComponentRemoveTool : IUnityMcpTool
    {
        public string Name => "component_remove";

        public string Description =>
            "Remove a Component by its instance ID. Refuses to remove Transform " +
            "(Unity does not permit it). Registers Undo.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "componentInstanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ArgumentException("'componentInstanceId' is required.");

            var comp = InstanceIdResolver.ComponentOrThrow(id);
            if (comp is Transform)
            {
                throw new ArgumentException("Cannot remove Transform — Unity requires every GameObject to have one.");
            }

            string typeName = comp.GetType().FullName;
            int goId = comp.gameObject.GetInstanceID();
            Undo.DestroyObjectImmediate(comp);

            var data = new JObject
            {
                ["componentInstanceId"] = id,
                ["gameObjectInstanceId"] = goId,
                ["type"] = typeName,
                ["removed"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }
    }
}
