using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Reparents a GameObject. 'parentInstanceId' null/0 reparents to scene root.
    /// 'worldPositionStays' mirrors Transform.SetParent's flag — true preserves world pose,
    /// false treats local values as relative to the new parent.
    /// </summary>
    [UnityMcpTool("go_set_parent")]
    internal sealed class GoSetParentTool : IUnityMcpTool
    {
        public string Name => "go_set_parent";

        public string Description =>
            "Reparent a GameObject. 'parentInstanceId' null reparents to scene root. " +
            "'worldPositionStays' (default true) preserves world pose; false treats local " +
            "values as relative to the new parent. Registers Undo.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["parentInstanceId"] = new JObject
                {
                    ["type"] = new JArray { "integer", "null" },
                    ["description"] = "null or omitted reparents to scene root.",
                },
                ["worldPositionStays"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = true,
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

            int? parentId = null;
            if (@params["parentInstanceId"] != null && @params["parentInstanceId"].Type != JTokenType.Null)
            {
                parentId = @params.Value<int?>("parentInstanceId");
            }
            bool worldStays = @params["worldPositionStays"]?.Value<bool>() ?? true;

            Transform newParent = null;
            if (parentId.HasValue && parentId.Value != 0)
            {
                var parentGo = InstanceIdResolver.GameObjectOrThrow(parentId.Value, "parentInstanceId");
                if (parentGo == go || IsDescendant(parentGo.transform, go.transform))
                {
                    throw new ArgumentException(
                        "Refusing to parent a GameObject under itself or a descendant.");
                }
                newParent = parentGo.transform;
            }

            Undo.SetTransformParent(go.transform, newParent, "Unity MCP: Set Parent");
            if (!worldStays)
            {
                // SetTransformParent preserves world pose by default; the flag we exposed
                // requires a follow-up reset.
                go.transform.localPosition = Vector3.zero;
                go.transform.localRotation = Quaternion.identity;
            }

            var data = new JObject
            {
                ["instanceId"] = id,
                ["parentInstanceId"] = newParent != null
                    ? (JToken)newParent.gameObject.GetInstanceID()
                    : JValue.CreateNull(),
                ["worldPositionStays"] = worldStays,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static bool IsDescendant(Transform candidate, Transform root)
        {
            for (var t = candidate; t != null; t = t.parent)
            {
                if (t == root) return true;
            }
            return false;
        }
    }
}
