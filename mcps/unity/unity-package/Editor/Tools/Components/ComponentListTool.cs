using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Lists Components on a GameObject — name, type, instance ID, and the count of
    /// public/serialized fields (cheap proxy for "how much does this component carry").
    /// Mirrors what go_serialize summarises but leaves the field bodies out.
    /// </summary>
    [UnityMcpTool("component_list")]
    internal sealed class ComponentListTool : IUnityMcpTool
    {
        public string Name => "component_list";

        public string Description =>
            "List components on a GameObject. Returns name, type (full + short), instance ID, " +
            "and the number of serialized fields per component. Cheaper than go_serialize when " +
            "you only need to know what's attached.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            var items = new JArray();
            foreach (var comp in go.GetComponents<Component>())
            {
                if (comp == null)
                {
                    items.Add(new JObject
                    {
                        ["type"] = "<missing>",
                        ["instanceId"] = 0,
                        ["fieldCount"] = 0,
                    });
                    continue;
                }
                items.Add(new JObject
                {
                    ["type"] = comp.GetType().Name,
                    ["typeFullName"] = comp.GetType().FullName,
                    ["instanceId"] = comp.GetInstanceID(),
                    ["fieldCount"] = SerializedFieldDumper.CountFields(comp),
                });
            }

            var data = new JObject
            {
                ["gameObjectInstanceId"] = id,
                ["count"] = items.Count,
                ["items"] = items,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

    }
}
