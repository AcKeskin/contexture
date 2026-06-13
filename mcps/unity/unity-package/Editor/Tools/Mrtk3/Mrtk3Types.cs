using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Reflection-based access to MRTK 3 component types. The unity-mcp package
    /// can't take a hard asmdef reference on Microsoft.MixedReality.Toolkit.* —
    /// the dev-template embeds MRTK as source rather than installing the UPM
    /// package, so the version-define route doesn't fire. Reflection compiles
    /// cleanly with or without MRTK present and resolves at runtime.
    /// </summary>
    internal static class Mrtk3Types
    {
        // Cache resolved types so we don't search every assembly per call.
        private static readonly Dictionary<string, Type> _cache = new(StringComparer.Ordinal);

        /// <summary>Look up an MRTK 3 type by short name OR by fully-qualified name.
        /// Searches all loaded MRTK 3 assemblies (matching <see cref="IsMrtkAssembly"/>).
        /// Returns null when not found. Internal — only consumed by IsInstanceOf.</summary>
        private static Type Resolve(string typeName)
        {
            if (string.IsNullOrEmpty(typeName)) return null;
            if (_cache.TryGetValue(typeName, out var cached)) return cached;

            // Direct hit — fully-qualified or assembly-qualified.
            var direct = Type.GetType(typeName, throwOnError: false);
            if (direct != null) { _cache[typeName] = direct; return direct; }

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                if (!IsMrtkAssembly(asm.GetName().Name)) continue;

                Type[] types;
                try { types = asm.GetTypes(); }
                catch (System.Reflection.ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }

                foreach (var t in types)
                {
                    if (t == null) continue;
                    if (t.Name == typeName || t.FullName == typeName)
                    {
                        _cache[typeName] = t;
                        return t;
                    }
                }
            }
            _cache[typeName] = null;
            return null;
        }

        /// <summary>True when the assembly name matches an MRTK 3 assembly. Matches both
        /// the Microsoft-published UPM prefix ("Microsoft.MixedReality.Toolkit") and the
        /// embedded-source prefix ("MixedReality.Toolkit", no Microsoft.) used by the
        /// MRTKDevTemplate's source layout. Either form is treated as MRTK present.</summary>
        public static bool IsMrtkAssembly(string asmName)
        {
            if (string.IsNullOrEmpty(asmName)) return false;
            return asmName.StartsWith("Microsoft.MixedReality.Toolkit", StringComparison.Ordinal)
                || asmName.StartsWith("MixedReality.Toolkit", StringComparison.Ordinal);
        }

        /// <summary>True when the component is an instance of the MRTK 3 type with
        /// the given short or fully-qualified name (or any subclass).</summary>
        public static bool IsInstanceOf(Component comp, string typeName)
        {
            if (comp == null) return false;
            var target = Resolve(typeName);
            if (target == null) return false;
            return target.IsAssignableFrom(comp.GetType());
        }

        /// <summary>List MRTK 3 components on a GameObject — returns components whose
        /// type lives in an MRTK 3 assembly (matches <see cref="IsMrtkAssembly"/>:
        /// both <c>Microsoft.MixedReality.Toolkit.*</c> UPM builds and the
        /// <c>MixedReality.Toolkit.*</c> embedded-source dev-template fork).</summary>
        public static IEnumerable<Component> GetMrtkComponents(GameObject go)
        {
            if (go == null) yield break;
            foreach (var c in go.GetComponents<Component>())
            {
                if (c == null) continue;
                if (IsMrtkAssembly(c.GetType().Assembly.GetName().Name))
                    yield return c;
            }
        }

    }
}
