using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Adds a Component to a GameObject by type name. Accepts fully-qualified names
    /// (`UnityEngine.Rigidbody`) or short names when unambiguous (`Rigidbody`). Returns
    /// `InvalidInput` with the candidate list when a short name resolves to multiple types.
    /// </summary>
    [UnityMcpTool("component_add")]
    internal sealed class ComponentAddTool : IUnityMcpTool
    {
        public string Name => "component_add";

        public string Description =>
            "Add a Component to a GameObject. 'componentType' is fully-qualified " +
            "('UnityEngine.Rigidbody') or short ('Rigidbody') when unambiguous. Errors with " +
            "InvalidInput on ambiguous short name (returns candidate list) or unknown type. " +
            "Adding RectTransform to a GameObject that has a plain Transform (or vice versa) " +
            "swaps them in-place — matches Unity's GameObject.AddComponent<RectTransform>() semantics.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["componentType"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "instanceId", "componentType" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");
            string typeName = @params.Value<string>("componentType");
            if (string.IsNullOrWhiteSpace(typeName))
            {
                throw new ArgumentException("'componentType' is required.");
            }

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            var type = ResolveComponentType(typeName);
            var added = Undo.AddComponent(go, type);
            if (added == null)
            {
                throw new InvalidOperationException(
                    $"AddComponent({type.FullName}) returned null. The type may forbid adding to this GameObject (e.g. RequireComponent missing dependencies).");
            }

            EditorUtility.SetDirty(go);

            var data = new JObject
            {
                ["componentInstanceId"] = added.GetInstanceID(),
                ["gameObjectInstanceId"] = id,
                ["type"] = added.GetType().FullName,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        internal static Type ResolveComponentType(string typeName)
        {
            // Fully-qualified first.
            var t = Type.GetType(typeName, throwOnError: false, ignoreCase: false);
            if (t != null && typeof(Component).IsAssignableFrom(t)) return t;

            // Short-name search across all loaded assemblies that derive from Component.
            var matches = new List<Type>();
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (System.Reflection.ReflectionTypeLoadException ex) { types = ex.Types.Where(x => x != null).ToArray(); }
                foreach (var candidate in types)
                {
                    if (candidate == null) continue;
                    if (!typeof(Component).IsAssignableFrom(candidate)) continue;
                    if (candidate.IsAbstract) continue;
                    if (candidate.Name == typeName || candidate.FullName == typeName)
                    {
                        matches.Add(candidate);
                    }
                }
            }

            if (matches.Count == 0)
            {
                throw new ArgumentException(
                    $"No Component type matches '{typeName}'. Try the fully-qualified name (e.g. 'UnityEngine.Rigidbody').");
            }
            if (matches.Count > 1)
            {
                var list = string.Join(", ", matches.Select(m => m.FullName));
                throw new ArgumentException(
                    $"Component type '{typeName}' is ambiguous. Candidates: {list}.");
            }
            return matches[0];
        }
    }
}
