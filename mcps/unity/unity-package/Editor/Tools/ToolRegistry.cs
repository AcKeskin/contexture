using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityMcp.Editor.Capabilities;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Reflection-based discovery of <see cref="IUnityMcpTool"/> implementations
    /// carrying <see cref="UnityMcpToolAttribute"/>. v1 scans only the package's
    /// own Editor assembly. v2 will extend to project-local custom-tools assemblies.
    /// </summary>
    internal static class ToolRegistry
    {
        internal readonly struct Entry
        {
            public readonly IUnityMcpTool Tool;
            public readonly UnityMcpToolAttribute Attribute;
            public readonly bool IsBuiltIn;
            public Entry(IUnityMcpTool tool, UnityMcpToolAttribute attribute, bool isBuiltIn)
            {
                Tool = tool;
                Attribute = attribute;
                IsBuiltIn = isBuiltIn;
            }
        }

        private static readonly Dictionary<string, Entry> _entries = new Dictionary<string, Entry>(StringComparer.Ordinal);
        private static bool _initialized;

        public static void Initialize()
        {
            if (_initialized) return;
            _initialized = true;
            _entries.Clear();

            // Built-ins first — they always win on naming collision.
            var packageAsm = typeof(ToolRegistry).Assembly;
            RegisterFromAssembly(packageAsm, isBuiltIn: true);

            // Project-local assemblies, opt-in via package config. Naming collisions
            // with built-ins are rejected here with a clear error log.
            if (PackageConfig.CustomToolsEnabled)
            {
                int customCount = 0;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    if (asm.IsDynamic) continue;
                    if (asm == packageAsm) continue;
                    if (!asm.GetName().Name.StartsWith("Assembly-CSharp", StringComparison.Ordinal)
                        && !ReferencesPackageAssembly(asm, packageAsm))
                    {
                        // Skip assemblies that can't possibly carry IUnityMcpTool subclasses —
                        // they don't reference our package's interface assembly. Cuts the scan
                        // cost from ~hundreds-of-assemblies to a handful.
                        continue;
                    }
                    customCount += RegisterFromAssembly(asm, isBuiltIn: false);
                }
                if (customCount > 0)
                {
                    Debug.Log($"[UnityMCP] registered {customCount} custom tool(s) from project assemblies.");
                }
            }
        }

        private static int RegisterFromAssembly(System.Reflection.Assembly asm, bool isBuiltIn)
        {
            int registered = 0;
            var candidates = SafeGetTypes(asm)
                .Where(t => t != null && !t.IsAbstract && !t.IsInterface)
                .Where(t => typeof(IUnityMcpTool).IsAssignableFrom(t))
                .Where(t => t.GetCustomAttribute<UnityMcpToolAttribute>() != null);

            foreach (var type in candidates)
            {
                try
                {
                    var attr = type.GetCustomAttribute<UnityMcpToolAttribute>();
                    var instance = (IUnityMcpTool)Activator.CreateInstance(type);
                    if (instance.Name != attr.Name)
                    {
                        Debug.LogWarning($"[UnityMCP] tool {type.FullName} attribute name '{attr.Name}' differs from instance Name '{instance.Name}'. Indexing by attribute.");
                    }
                    if (_entries.ContainsKey(attr.Name))
                    {
                        // Built-in vs. custom collision — built-in always wins per plan §12.
                        if (isBuiltIn)
                        {
                            Debug.LogError($"[UnityMCP] duplicate tool name '{attr.Name}' on built-in {type.FullName}; ignoring duplicate.");
                        }
                        else
                        {
                            Debug.LogError($"[UnityMCP] custom tool name '{attr.Name}' on {type.FullName} collides with a built-in; rejecting custom. Rename the custom tool.");
                        }
                        continue;
                    }
                    _entries[attr.Name] = new Entry(instance, attr, isBuiltIn);
                    registered++;
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[UnityMCP] failed to instantiate tool {type.FullName}: {ex.Message}");
                }
            }
            return registered;
        }

        private static bool ReferencesPackageAssembly(System.Reflection.Assembly asm, System.Reflection.Assembly packageAsm)
        {
            try
            {
                var packageName = packageAsm.GetName().Name;
                foreach (var refName in asm.GetReferencedAssemblies())
                {
                    if (refName.Name == packageName) return true;
                }
            }
            catch { /* best-effort */ }
            return false;
        }

        public static IUnityMcpTool Lookup(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            return _entries.TryGetValue(name, out var e) ? e.Tool : null;
        }

        public static IReadOnlyCollection<IUnityMcpTool> All()
        {
            return _entries.Values.Select(e => e.Tool).ToArray();
        }

        public static IEnumerable<Entry> AllSatisfying(CapabilitySet caps)
        {
            foreach (var e in _entries.Values)
            {
                if (Satisfies(e.Attribute, caps)) yield return e;
            }
        }

        private static bool Satisfies(UnityMcpToolAttribute attr, CapabilitySet caps)
        {
            if (attr.Requires == null || attr.Requires.Length == 0) return true;
            if (caps == null) return false;
            foreach (var key in attr.Requires)
            {
                if (!caps.Has(key)) return false;
            }
            return true;
        }

        private static IEnumerable<Type> SafeGetTypes(Assembly asm)
        {
            try
            {
                return asm.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                return ex.Types.Where(t => t != null);
            }
        }
    }
}
