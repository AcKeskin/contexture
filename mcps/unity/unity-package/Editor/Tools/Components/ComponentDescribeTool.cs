using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Enumerates visible serialized properties of a Component. Useful for discovering
    /// propertyPaths before calling component_set_property.
    /// </summary>
    [UnityMcpTool("component_describe")]
    internal sealed class ComponentDescribeTool : IUnityMcpTool
    {
        public string Name => "component_describe";

        public string Description =>
            "Enumerate the visible serialized properties of a Component — propertyPath " +
            "(use with component_set_property), displayName, type, currentValue, and for enums " +
            "the allowed enumValues. Saves a guess-and-check round-trip when discovering what's settable.";

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

            #pragma warning disable CS0618 // InstanceIDToObject deprecation; see InstanceIdResolver.cs
            var obj = EditorUtility.InstanceIDToObject(id);
            #pragma warning restore CS0618
            var comp = obj as Component;
            if (comp == null)
            {
                throw new ArgumentException($"componentInstanceId {id} did not resolve to a Component.");
            }

            var so = new SerializedObject(comp);
            var properties = new JArray();
            var prop = so.GetIterator();
            bool enterChildren = true;
            while (prop.NextVisible(enterChildren))
            {
                enterChildren = false;
                var entry = new JObject
                {
                    ["propertyPath"] = prop.propertyPath,
                    ["displayName"] = prop.displayName,
                    ["type"] = prop.propertyType.ToString(),
                    ["currentValue"] = GetCurrentValue(prop),
                };

                if (prop.propertyType == SerializedPropertyType.Enum && prop.enumNames != null)
                {
                    var enumVals = new JArray();
                    foreach (var e in prop.enumNames) enumVals.Add(e);
                    entry["enumValues"] = enumVals;
                }

                properties.Add(entry);
            }

            var data = new JObject
            {
                ["componentInstanceId"] = id,
                ["componentType"] = comp.GetType().FullName,
                ["propertyCount"] = properties.Count,
                ["properties"] = properties,
            };

            return Task.FromResult(ToolResult.Json(data));
        }

        private static JToken GetCurrentValue(SerializedProperty prop)
        {
            switch (prop.propertyType)
            {
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.LayerMask:
                    return prop.intValue;
                case SerializedPropertyType.Boolean:
                    return prop.boolValue;
                case SerializedPropertyType.Float:
                    return prop.floatValue;
                case SerializedPropertyType.String:
                    return prop.stringValue;
                case SerializedPropertyType.Enum:
                    return prop.enumValueIndex < prop.enumNames?.Length
                        ? (JToken)prop.enumNames[prop.enumValueIndex]
                        : prop.enumValueIndex;
                case SerializedPropertyType.ObjectReference:
                    return prop.objectReferenceValue != null
                        ? (JToken)prop.objectReferenceValue.GetInstanceID()
                        : JValue.CreateNull();
                default:
                    // Compound types (arrays, structs, etc.) are not deep-serialised here.
                    return "<compound>";
            }
        }
    }
}
