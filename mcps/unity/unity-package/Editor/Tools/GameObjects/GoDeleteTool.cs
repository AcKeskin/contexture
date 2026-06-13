using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Deletes a GameObject by instance ID. Registers Undo so the user can revert
    /// in-Editor. Errors with InvalidInput when the ID does not resolve.
    /// </summary>
    [UnityMcpTool("go_delete")]
    internal sealed class GoDeleteTool : IUnityMcpTool
    {
        public string Name => "go_delete";

        public string Description =>
            "Delete a GameObject by instanceId. Registers Undo. Errors if the ID does not " +
            "resolve to a GameObject. Returns the deleted name + path for confirmation.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject
                {
                    ["type"] = "integer",
                    ["description"] = "Instance ID returned by go_create / go_find / scene_info.",
                },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            string priorName = go.name;
            string priorPath = GameObjectPaths.HierarchyPath(go);

            Undo.DestroyObjectImmediate(go);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["name"] = priorName,
                ["path"] = priorPath,
                ["deleted"] = true,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

    }
}
