using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace UnityMcp.Editor.Tools.Reflection
{
    /// <summary>
    /// Read-only reflection over the Editor's loaded assemblies. Agents use it
    /// to verify a method / property exists before generating C# that calls it,
    /// avoiding the compile-fail-then-retry loop. Two actions:
    ///
    ///   inspect_type — full public surface for one type. Resolves by
    ///         fully-qualified name (UnityEngine.GameObject) or short name
    ///         (PressableButton, walks every loaded assembly until a unique
    ///         match is found; ambiguous short names error with the candidate
    ///         list so the caller can disambiguate).
    ///
    ///   find_member — search every loaded assembly for members whose name
    ///         matches (case-insensitive, exact match by default; pass
    ///         contains:true for substring search). Returns up to 'limit' hits.
    ///
    /// Both actions skip non-public members — the goal is to steer agents
    /// toward the supported public surface, not internals that may shift.
    /// Generic-method *definitions* (T-parameterized generics) are also
    /// skipped from find_member to keep results readable; constructed
    /// generics surface normally inside inspect_type.
    /// </summary>
    [UnityMcpTool("unity_reflect")]
    internal sealed class UnityReflectTool : IUnityMcpTool
    {
        public string Name => "unity_reflect";

        public string Description =>
            "Read-only reflection over the Editor's loaded assemblies. " +
            "action=inspect_type|find_member. inspect_type: required 'typeName' " +
            "(FQN like 'UnityEngine.GameObject' or short name like 'PressableButton'). " +
            "Returns { fullName, baseType, interfaces[], methods[], properties[], " +
            "fields[], events[] } where each member is { name, signature, " +
            "isStatic, declaringType }. Short-name lookups error when ambiguous, " +
            "listing the candidates. find_member: required 'memberName'; optional " +
            "'contains' (default false = exact match), 'limit' (default 50, max 500), " +
            "'memberKinds' (subset of method/property/field/event; default all). " +
            "Returns { count, items: [{ memberName, memberKind, declaringType, " +
            "signature }] }. Public members only; internals skipped.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "inspect_type", "find_member" },
                },
                ["typeName"] = new JObject { ["type"] = "string" },
                ["memberName"] = new JObject { ["type"] = "string" },
                ["contains"] = new JObject { ["type"] = "boolean", ["default"] = false },
                ["limit"] = new JObject { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 500, ["default"] = 50 },
                ["memberKinds"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject
                    {
                        ["type"] = "string",
                        ["enum"] = new JArray { "method", "property", "field", "event" },
                    },
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            switch (action)
            {
                case "inspect_type":
                    return Task.FromResult(InspectType(@params.Value<string>("typeName")));
                case "find_member":
                    return Task.FromResult(FindMember(
                        @params.Value<string>("memberName"),
                        @params.Value<bool?>("contains") ?? false,
                        @params.Value<int?>("limit") ?? 50,
                        ParseMemberKinds(@params["memberKinds"] as JArray)));
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be inspect_type or find_member; got '{action}'.");
            }
        }

        private static ToolResult InspectType(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName))
                throw new ToolException("InvalidInput", "'typeName' is required for action=inspect_type.");

            var type = ResolveType(typeName);

            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            // We collect declared-only at each level then walk the chain so the
            // output reflects which type owns each member. Inherited members
            // surface with their actual declaringType.

            var methods = new JArray();
            var properties = new JArray();
            var fields = new JArray();
            var events = new JArray();

            for (var t = type; t != null && t != typeof(object); t = t.BaseType)
            {
                foreach (var m in t.GetMethods(flags))
                {
                    if (m.IsSpecialName) continue;          // skip property accessors / op_*
                    if (m.IsGenericMethodDefinition) continue;
                    methods.Add(SerializeMethod(m));
                }
                foreach (var p in t.GetProperties(flags))
                {
                    properties.Add(SerializeProperty(p));
                }
                foreach (var f in t.GetFields(flags))
                {
                    fields.Add(SerializeField(f));
                }
                foreach (var e in t.GetEvents(flags))
                {
                    events.Add(SerializeEvent(e));
                }
            }

            var interfaces = new JArray();
            foreach (var i in type.GetInterfaces())
            {
                interfaces.Add(i.FullName ?? i.Name);
            }

            var data = new JObject
            {
                ["fullName"] = type.FullName,
                ["assembly"] = type.Assembly.GetName().Name,
                ["baseType"] = type.BaseType?.FullName ?? string.Empty,
                ["isAbstract"] = type.IsAbstract,
                ["isSealed"] = type.IsSealed,
                ["isInterface"] = type.IsInterface,
                ["interfaces"] = interfaces,
                ["methods"] = methods,
                ["properties"] = properties,
                ["fields"] = fields,
                ["events"] = events,
            };
            return ToolResult.Json(data);
        }

        private static ToolResult FindMember(string memberName, bool contains, int limit, HashSet<string> memberKinds)
        {
            if (string.IsNullOrWhiteSpace(memberName))
                throw new ToolException("InvalidInput", "'memberName' is required for action=find_member.");
            if (limit < 1) limit = 1;
            if (limit > 500) limit = 500;

            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            var hits = new JArray();
            int count = 0;
            bool truncated = false;

            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
                foreach (var t in types)
                {
                    if (t == null || !t.IsPublic) continue;
                    if (count >= limit) { truncated = true; break; }

                    if (memberKinds == null || memberKinds.Contains("method"))
                    {
                        foreach (var m in t.GetMethods(flags))
                        {
                            if (m.IsSpecialName || m.IsGenericMethodDefinition) continue;
                            if (!Match(m.Name, memberName, contains)) continue;
                            hits.Add(SerializeHit("method", t, m.Name, MethodSignature(m)));
                            if (++count >= limit) { truncated = true; break; }
                        }
                    }
                    if (count >= limit) break;
                    if (memberKinds == null || memberKinds.Contains("property"))
                    {
                        foreach (var p in t.GetProperties(flags))
                        {
                            if (!Match(p.Name, memberName, contains)) continue;
                            hits.Add(SerializeHit("property", t, p.Name, PropertySignature(p)));
                            if (++count >= limit) { truncated = true; break; }
                        }
                    }
                    if (count >= limit) break;
                    if (memberKinds == null || memberKinds.Contains("field"))
                    {
                        foreach (var f in t.GetFields(flags))
                        {
                            if (!Match(f.Name, memberName, contains)) continue;
                            hits.Add(SerializeHit("field", t, f.Name, FieldSignature(f)));
                            if (++count >= limit) { truncated = true; break; }
                        }
                    }
                    if (count >= limit) break;
                    if (memberKinds == null || memberKinds.Contains("event"))
                    {
                        foreach (var e in t.GetEvents(flags))
                        {
                            if (!Match(e.Name, memberName, contains)) continue;
                            hits.Add(SerializeHit("event", t, e.Name, EventSignature(e)));
                            if (++count >= limit) { truncated = true; break; }
                        }
                    }
                }
                if (count >= limit) break;
            }

            return ToolResult.Json(new JObject
            {
                ["count"] = hits.Count,
                ["truncated"] = truncated,
                ["items"] = hits,
            });
        }

        private static bool Match(string name, string query, bool contains)
        {
            if (contains) return name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
            return string.Equals(name, query, StringComparison.OrdinalIgnoreCase);
        }

        private static HashSet<string> ParseMemberKinds(JArray arr)
        {
            if (arr == null || arr.Count == 0) return null;
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in arr)
            {
                var s = t.Value<string>();
                if (!string.IsNullOrEmpty(s)) set.Add(s);
            }
            return set.Count == 0 ? null : set;
        }

        private static Type ResolveType(string typeName)
        {
            // Direct hit — fully-qualified or assembly-qualified.
            var direct = Type.GetType(typeName, throwOnError: false);
            if (direct != null) return direct;

            // Walk assemblies for short-name or namespace.short-name matches.
            var matches = new List<Type>();
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
                foreach (var t in types)
                {
                    if (t == null || !t.IsPublic) continue;
                    if (t.FullName == typeName || t.Name == typeName)
                    {
                        matches.Add(t);
                    }
                }
            }

            if (matches.Count == 0)
                throw new ToolException("InvalidInput",
                    $"Type '{typeName}' not found in any loaded assembly. Try the fully-qualified name (e.g. 'UnityEngine.GameObject').");
            if (matches.Count > 1)
            {
                var candidates = string.Join(", ", matches.Take(10).Select(t => t.FullName));
                throw new ToolException("InvalidInput",
                    $"Type name '{typeName}' is ambiguous; {matches.Count} matches: {candidates}. Use the fully-qualified name to disambiguate.");
            }
            return matches[0];
        }

        private static JObject SerializeMethod(MethodInfo m)
        {
            return new JObject
            {
                ["name"] = m.Name,
                ["signature"] = MethodSignature(m),
                ["isStatic"] = m.IsStatic,
                ["declaringType"] = m.DeclaringType?.FullName ?? string.Empty,
            };
        }

        private static JObject SerializeProperty(PropertyInfo p)
        {
            return new JObject
            {
                ["name"] = p.Name,
                ["signature"] = PropertySignature(p),
                ["isStatic"] = (p.GetMethod ?? p.SetMethod)?.IsStatic ?? false,
                ["declaringType"] = p.DeclaringType?.FullName ?? string.Empty,
                ["canRead"] = p.CanRead,
                ["canWrite"] = p.CanWrite,
            };
        }

        private static JObject SerializeField(FieldInfo f)
        {
            return new JObject
            {
                ["name"] = f.Name,
                ["signature"] = FieldSignature(f),
                ["isStatic"] = f.IsStatic,
                ["declaringType"] = f.DeclaringType?.FullName ?? string.Empty,
            };
        }

        private static JObject SerializeEvent(EventInfo e)
        {
            return new JObject
            {
                ["name"] = e.Name,
                ["signature"] = EventSignature(e),
                ["declaringType"] = e.DeclaringType?.FullName ?? string.Empty,
            };
        }

        private static JObject SerializeHit(string memberKind, Type t, string memberName, string signature)
        {
            return new JObject
            {
                ["memberName"] = memberName,
                ["memberKind"] = memberKind,
                ["declaringType"] = t.FullName ?? t.Name,
                ["signature"] = signature,
            };
        }

        private static string MethodSignature(MethodInfo m)
        {
            var sb = new StringBuilder();
            if (m.IsStatic) sb.Append("static ");
            sb.Append(ShortTypeName(m.ReturnType)).Append(' ').Append(m.Name).Append('(');
            var ps = m.GetParameters();
            for (int i = 0; i < ps.Length; i++)
            {
                if (i > 0) sb.Append(", ");
                sb.Append(ShortTypeName(ps[i].ParameterType)).Append(' ').Append(ps[i].Name);
            }
            sb.Append(')');
            return sb.ToString();
        }

        private static string PropertySignature(PropertyInfo p)
        {
            var accessors = (p.CanRead ? "get;" : "") + (p.CanWrite ? " set;" : "");
            return $"{ShortTypeName(p.PropertyType)} {p.Name} {{ {accessors.Trim()} }}";
        }

        private static string FieldSignature(FieldInfo f)
        {
            var prefix = f.IsStatic ? "static " : string.Empty;
            return $"{prefix}{ShortTypeName(f.FieldType)} {f.Name}";
        }

        private static string EventSignature(EventInfo e)
        {
            return $"event {ShortTypeName(e.EventHandlerType)} {e.Name}";
        }

        private static string ShortTypeName(Type t)
        {
            if (t == null) return "void";
            if (t == typeof(void)) return "void";
            if (t == typeof(int)) return "int";
            if (t == typeof(float)) return "float";
            if (t == typeof(double)) return "double";
            if (t == typeof(bool)) return "bool";
            if (t == typeof(string)) return "string";
            if (t == typeof(object)) return "object";
            if (t.IsArray) return ShortTypeName(t.GetElementType()) + "[]";
            if (t.IsGenericType)
            {
                var name = t.Name;
                int tick = name.IndexOf('`');
                if (tick > 0) name = name.Substring(0, tick);
                var args = string.Join(", ", t.GetGenericArguments().Select(ShortTypeName));
                return $"{name}<{args}>";
            }
            return t.Name;
        }
    }
}
