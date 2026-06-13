using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Sets a serialized property on a Component. Property paths use Unity's native
    /// SerializedProperty syntax (e.g. `m_LocalRotation.x`, `m_Materials.Array.data[0]`),
    /// with a small alias map for common shorthands (e.g. `position` → `m_LocalPosition`,
    /// `rotation` → `m_LocalRotation`). Goes through SerializedObject so Undo records and
    /// inspectors update.
    /// </summary>
    [UnityMcpTool("component_set_property")]
    internal sealed class ComponentSetPropertyTool : IUnityMcpTool
    {
        // Common aliases. Limited surface in v2 — Transform fields cover ~80% of agent needs.
        private static readonly Dictionary<string, string> _aliases = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "position", "m_LocalPosition" },
            { "localPosition", "m_LocalPosition" },
            { "rotation", "m_LocalRotation" },
            { "localRotation", "m_LocalRotation" },
            { "scale", "m_LocalScale" },
            { "localScale", "m_LocalScale" },
            { "name", "m_Name" },
            { "tag", "m_TagString" },
        };

        public string Name => "component_set_property";

        public string Description =>
            "Set a serialized property on a Component. 'propertyPath' uses Unity " +
            "SerializedProperty syntax ('m_LocalRotation.x', 'm_Materials.Array.data[0]') with " +
            "a small alias map ('position', 'rotation', 'scale', 'name', 'tag'). 'value' types: " +
            "numbers, booleans, strings, arrays for Vector*/Color/Quaternion, enum string names. " +
            "Object refs accept: an instanceId integer (scene object), { $ref: <instanceId> }, " +
            "{ $guid: \"<assetGuid>\" } or { $path: \"<asset-path>\" } (project asset, e.g. an " +
            "InputActionAsset), or null to clear. Send these as JSON values, NOT JSON strings — " +
            "but a stringified form (\"50370\", \"{\\\"$guid\\\":...}\") is recovered. Returns " +
            "InvalidInput with details.unsupportedType for AnimationCurve/Gradient/[SerializeReference]. " +
            "Undo recorded.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
                ["propertyPath"] = new JObject { ["type"] = "string" },
                ["value"] = new JObject
                {
                    ["description"] = "Number, boolean, string, array (Vector*/Color/Quaternion), enum-name, instanceId int, or null for Object refs.",
                },
            },
            ["required"] = new JArray { "componentInstanceId", "propertyPath" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("componentInstanceId")
                ?? throw new ArgumentException("'componentInstanceId' is required.");
            string rawPath = @params.Value<string>("propertyPath");
            if (string.IsNullOrWhiteSpace(rawPath))
            {
                throw new ArgumentException("'propertyPath' is required.");
            }
            JToken value = @params["value"];

            var comp = InstanceIdResolver.ComponentOrThrow(id);

            string resolvedPath = ResolveAlias(rawPath);

            using (var so = new SerializedObject(comp))
            {
                var p = so.FindProperty(resolvedPath);
                if (p == null)
                {
                    throw new ArgumentException(
                        $"Property '{resolvedPath}' not found on {comp.GetType().Name}. " +
                        $"Use 'component_list' or 'go_serialize' to see available properties.");
                }

                try
                {
                    PropertyValueCoercion.Apply(p, value);
                }
                catch (PropertyValueCoercion.CoercionUnsupportedException ex)
                {
                    throw new ToolException(
                        "InvalidInput",
                        ex.Message,
                        new JObject { ["unsupportedType"] = ex.UnsupportedType });
                }

                so.ApplyModifiedProperties();
            }

            EditorUtility.SetDirty(comp);

            var data = new JObject
            {
                ["componentInstanceId"] = id,
                ["propertyPath"] = resolvedPath,
                ["resolvedFromAlias"] = rawPath != resolvedPath,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static string ResolveAlias(string path)
        {
            // Aliases match the leading segment only — e.g. `position.x` → `m_LocalPosition.x`.
            int dot = path.IndexOf('.');
            string leading = dot >= 0 ? path.Substring(0, dot) : path;
            string rest = dot >= 0 ? path.Substring(dot) : string.Empty;
            return _aliases.TryGetValue(leading, out var resolved)
                ? resolved + rest
                : path;
        }
    }
}
