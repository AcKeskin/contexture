using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Sets N serialized properties on one Component in a single tool call,
    /// with all-or-nothing transactional semantics.
    ///
    /// One <see cref="SerializedObject"/> wraps the target for the whole
    /// batch. Each write is staged via <see cref="SerializedObject.FindProperty"/>
    /// + <see cref="PropertyValueCoercion.Apply"/>. <see cref="SerializedObject.ApplyModifiedProperties"/>
    /// runs ONCE at the end of the successful batch — that's what produces
    /// the single Undo entry the caller observes.
    ///
    /// On any per-write failure, the SerializedObject's pending changes are
    /// discarded by simply NOT calling ApplyModifiedProperties — the
    /// SerializedObject goes out of scope, Unity reverts the in-memory edits.
    /// No <see cref="Undo.RevertAllInCurrentGroup"/> needed. The error
    /// surfaces with <c>details.failedAt = &lt;propertyPath&gt;</c> so callers
    /// can branch programmatically.
    ///
    /// Errors surface the structured <c>Details</c> JObject via the MCP
    /// server's error envelope as a JSON-encoded "Details:" line appended
    /// to the message text. Callers recover failedAt via
    /// <c>/^Details: (\{.*\})$/m</c> and JSON-parse the match.
    ///
    /// Alias map is the same as <see cref="ComponentSetPropertyTool"/> —
    /// duplicated locally rather than refactored into a shared helper because
    /// the map is 8 entries that change rarely.
    /// </summary>
    [UnityMcpTool("component_set_properties")]
    internal sealed class ComponentSetPropertiesTool : IUnityMcpTool
    {
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

        public string Name => "component_set_properties";

        public string Description =>
            "PREFER THIS over multiple component_set_property calls when writing 2+ " +
            "fields on the same component. Sets N serialized properties in one " +
            "transactional batch — all-or-nothing, single Undo entry, one main-thread " +
            "round-trip instead of N. On any write failure no writes commit and the " +
            "error surfaces { code: 'InvalidInput', details: { failedAt: " +
            "'<propertyPath>' } }. propertyPath supports the same alias map as " +
            "component_set_property (position/rotation/scale/name/tag) and the same " +
            "value coercion rules (numbers, booleans, strings, arrays for " +
            "Vector*/Color/Quaternion, enum string names, instanceId integer for " +
            "Object refs). Empty writes array → InvalidInput.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
                ["writes"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JObject
                        {
                            ["propertyPath"] = new JObject { ["type"] = "string" },
                            ["value"] = new JObject
                            {
                                ["description"] = "Number, boolean, string, array, enum-name, instanceId int, or null.",
                            },
                        },
                        ["required"] = new JArray { "propertyPath" },
                    },
                    ["minItems"] = 1,
                },
            },
            ["required"] = new JArray { "componentInstanceId", "writes" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int componentId = @params.Value<int?>("componentInstanceId")
                ?? throw new ToolException("InvalidInput", "'componentInstanceId' is required.");
            var writes = @params["writes"] as JArray
                ?? throw new ToolException("InvalidInput", "'writes' is required and must be an array.");
            if (writes.Count == 0)
                throw new ToolException("InvalidInput", "'writes' must contain at least one entry.");

            var comp = InstanceIdResolver.ComponentOrThrow(componentId);

            var appliedPaths = new JArray();
            using (var so = new SerializedObject(comp))
            {
                for (int i = 0; i < writes.Count; i++)
                {
                    var write = writes[i] as JObject;
                    if (write == null)
                        throw FailedAt(i.ToString(), "InvalidInput",
                            $"writes[{i}] is not an object.");

                    var rawPath = write.Value<string>("propertyPath");
                    if (string.IsNullOrWhiteSpace(rawPath))
                        throw FailedAt($"writes[{i}].propertyPath", "InvalidInput",
                            $"writes[{i}] is missing 'propertyPath' or it is empty.");

                    var resolvedPath = ResolveAlias(rawPath);
                    var prop = so.FindProperty(resolvedPath);
                    if (prop == null)
                    {
                        throw FailedAt(resolvedPath, "InvalidInput",
                            $"Property '{resolvedPath}' not found on {comp.GetType().Name}.");
                    }

                    var value = write["value"];
                    try
                    {
                        PropertyValueCoercion.Apply(prop, value);
                    }
                    catch (PropertyValueCoercion.CoercionUnsupportedException ex)
                    {
                        throw FailedAt(resolvedPath, "InvalidInput", ex.Message,
                            new JObject { ["unsupportedType"] = ex.UnsupportedType });
                    }
                    catch (ArgumentException ex)
                    {
                        throw FailedAt(resolvedPath, "InvalidInput", ex.Message);
                    }

                    appliedPaths.Add(resolvedPath);
                }

                // Commit ALL writes as a single Undo step. If we got here, every
                // FindProperty + Apply succeeded.
                so.ApplyModifiedProperties();
            }
            EditorUtility.SetDirty(comp);

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["componentInstanceId"] = componentId,
                ["written"] = appliedPaths.Count,
                ["propertyPaths"] = appliedPaths,
            }));
        }

        private static string ResolveAlias(string path)
        {
            int dot = path.IndexOf('.');
            string leading = dot >= 0 ? path.Substring(0, dot) : path;
            string rest = dot >= 0 ? path.Substring(dot) : string.Empty;
            return _aliases.TryGetValue(leading, out var resolved)
                ? resolved + rest
                : path;
        }

        /// <summary>
        /// Builds the structured error envelope expected by the rollback criterion.
        /// failedAt is the propertyPath (post-alias-resolution) the batch died on.
        /// Additional details (e.g. unsupportedType) are merged in. The MCP
        /// server surfaces this Details JObject as a JSON-encoded "Details:"
        /// line in the error text; callers recover failedAt via
        /// <c>/^Details: (\{.*\})$/m</c> and JSON-parse the match.
        /// </summary>
        private static ToolException FailedAt(string propertyPath, string code, string message, JObject extra = null)
        {
            var details = new JObject { ["failedAt"] = propertyPath };
            if (extra != null)
            {
                foreach (var kvp in extra)
                    details[kvp.Key] = kvp.Value;
            }
            return new ToolException(code, message, details);
        }
    }
}
