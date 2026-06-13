using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Returns a structured JSON dump of a GameObject + its components. Lossy by default:
    /// primitives, Vector*, Color, enums, and Object refs (as {$ref:instanceId}) are
    /// preserved; AnimationCurve/Gradient/ManagedReference render as "&lt;unsupported: T&gt;".
    /// 'depth' (default 1, max 4) controls how deeply children are expanded. Cycles broken
    /// via visited-set on instance ID.
    /// </summary>
    [UnityMcpTool("go_serialize")]
    internal sealed class GoSerializeTool : IUnityMcpTool
    {
        public string Name => "go_serialize";

        public string Description =>
            "Dump a GameObject + its components as JSON. Lossy: primitives/Vector*/Color/" +
            "enums/Object-refs preserved; complex types ('AnimationCurve' etc.) marked " +
            "'<unsupported: T>'. 'depth' (default 1, max 4) controls child expansion. " +
            "Cycles broken via visited-set.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["depth"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 0,
                    ["maximum"] = 4,
                    ["default"] = 1,
                },
                ["includeComponentFields"] = new JObject
                {
                    ["type"] = "boolean",
                    ["default"] = true,
                    ["description"] = "When false, components are returned as type+id summaries only.",
                },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");
            int depth = @params["depth"]?.Value<int>() ?? 1;
            bool includeFields = @params["includeComponentFields"]?.Value<bool>() ?? true;
            if (depth < 0) depth = 0;
            if (depth > 4) depth = 4;

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            var visited = new HashSet<int>();
            var data = SerializeGo(go, depth, includeFields, visited);
            return Task.FromResult(ToolResult.Json(data));
        }

        private static JObject SerializeGo(GameObject go, int remainingDepth, bool includeFields, HashSet<int> visited)
        {
            int id = go.GetInstanceID();
            if (visited.Contains(id))
            {
                return new JObject
                {
                    ["$cycle"] = id,
                    ["name"] = go.name ?? string.Empty,
                };
            }
            visited.Add(id);

            var t = go.transform;
            var components = new JArray();
            foreach (var c in go.GetComponents<Component>())
            {
                if (c == null)
                {
                    components.Add(new JObject { ["type"] = "<missing>", ["instanceId"] = 0 });
                    continue;
                }

                var compEntry = new JObject
                {
                    ["type"] = c.GetType().Name,
                    ["instanceId"] = c.GetInstanceID(),
                };
                if (includeFields)
                {
                    compEntry["fields"] = SerializedFieldDumper.DumpComponent(c, visited);
                }
                else
                {
                    compEntry["fieldCount"] = SerializedFieldDumper.CountFields(c);
                }
                components.Add(compEntry);
            }

            var children = new JArray();
            if (remainingDepth > 0)
            {
                for (int i = 0; i < t.childCount; i++)
                {
                    children.Add(SerializeGo(t.GetChild(i).gameObject, remainingDepth - 1, includeFields, visited));
                }
            }

            return new JObject
            {
                ["instanceId"] = id,
                ["name"] = go.name ?? string.Empty,
                ["path"] = GameObjectPaths.HierarchyPath(go),
                ["activeSelf"] = go.activeSelf,
                ["activeInHierarchy"] = go.activeInHierarchy,
                ["transform"] = new JObject
                {
                    ["localPosition"] = Vector3Json.ToJson(t.localPosition),
                    ["localRotation"] = Vector3Json.ToJson(t.localRotation),
                    ["localScale"] = Vector3Json.ToJson(t.localScale),
                },
                ["components"] = components,
                ["childCount"] = t.childCount,
                ["children"] = children,
                ["depthRemaining"] = remainingDepth,
            };
        }

    }
}
