using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Dumps a Component's serialized fields into a JSON object. Fidelity is caller-selected via
    /// the <c>fullFidelity</c> flag:
    ///   - <c>false</c> (the cheap go_serialize path) — primitives, Vector*, Color, Quaternion,
    ///     enums, and Object refs are supported; AnimationCurve / Gradient / ManagedReference /
    ///     ExposedReference render as "&lt;unsupported: T&gt;" rather than silently dropping.
    ///   - <c>true</c> (the go_serialize_full path) — those four complex types are serialized in
    ///     full (curve keys, gradient stops, the boxed [SerializeReference] instance with a
    ///     depth-capped / cycle-broken recursion, exposed-reference name+default).
    ///
    /// Reads via SerializedObject so the result matches what the inspector sees, including
    /// [SerializeField] private members.
    /// </summary>
    internal static class SerializedFieldDumper
    {
        // Depth budget for recursing into [SerializeReference]/ManagedReference graphs.
        // These graphs can be deep and cyclic; the cap bounds work and, together with the
        // visited-set on managedReferenceId, breaks cycles. A node whose body is elided by
        // the cap or by cycle-detection still emits its typename, marked with "$truncated"
        // so a typename is never orphaned from a missing body.
        private const int ManagedRefMaxDepth = 6;

        /// <summary>Counts a Component's serialized fields (excluding the m_Script
        /// reference). Cheap proxy for "how much state does this component carry"
        /// without paying the dump-bodies cost.</summary>
        public static int CountFields(Component c)
        {
            if (c == null) return 0;
            int count = 0;
            using (var so = new SerializedObject(c))
            {
                var p = so.GetIterator();
                bool first = true;
                while (p.NextVisible(first))
                {
                    first = false;
                    if (p.name == "m_Script") continue;
                    count++;
                }
            }
            return count;
        }

        /// <summary>
        /// Dumps a Component's serialized fields. When <paramref name="fullFidelity"/> is false
        /// (the cheap lossy path used by <c>go_serialize</c>), AnimationCurve / Gradient /
        /// ManagedReference / ExposedReference render as "&lt;unsupported: T&gt;" exactly as before.
        /// When true (the <c>go_serialize_full</c> path) those types are serialized in full.
        /// </summary>
        public static JObject DumpComponent(Component comp, HashSet<int> visited, bool fullFidelity = false)
        {
            var result = new JObject();
            if (comp == null) return result;

            using (var so = new SerializedObject(comp))
            {
                var prop = so.GetIterator();
                bool enterChildren = true;
                while (prop.NextVisible(enterChildren))
                {
                    enterChildren = false; // top-level only; arrays/structs render flat keys
                    if (prop.name == "m_Script") continue;
                    result[prop.name] = DumpProperty(prop, visited, fullFidelity);
                }
            }
            return result;
        }

        private static JToken DumpProperty(SerializedProperty p, HashSet<int> visited, bool fullFidelity)
        {
            switch (p.propertyType)
            {
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.LayerMask:
                    return p.intValue;
                case SerializedPropertyType.Boolean:
                    return p.boolValue;
                case SerializedPropertyType.Float:
                    return p.floatValue;
                case SerializedPropertyType.String:
                    return p.stringValue ?? string.Empty;
                case SerializedPropertyType.Color:
                {
                    var c = p.colorValue;
                    return new JArray(c.r, c.g, c.b, c.a);
                }
                case SerializedPropertyType.Vector2:
                {
                    var v = p.vector2Value;
                    return new JArray(v.x, v.y);
                }
                case SerializedPropertyType.Vector3:
                {
                    var v = p.vector3Value;
                    return new JArray(v.x, v.y, v.z);
                }
                case SerializedPropertyType.Vector4:
                {
                    var v = p.vector4Value;
                    return new JArray(v.x, v.y, v.z, v.w);
                }
                case SerializedPropertyType.Quaternion:
                {
                    var q = p.quaternionValue;
                    return new JArray(q.x, q.y, q.z, q.w);
                }
                case SerializedPropertyType.Rect:
                {
                    var r = p.rectValue;
                    return new JArray(r.x, r.y, r.width, r.height);
                }
                case SerializedPropertyType.Bounds:
                {
                    var b = p.boundsValue;
                    return new JObject
                    {
                        ["center"] = new JArray(b.center.x, b.center.y, b.center.z),
                        ["size"] = new JArray(b.size.x, b.size.y, b.size.z),
                    };
                }
                case SerializedPropertyType.Enum:
                {
                    if (p.enumNames != null && p.enumValueIndex >= 0 && p.enumValueIndex < p.enumNames.Length)
                        return p.enumNames[p.enumValueIndex];
                    return p.intValue;
                }
                case SerializedPropertyType.ObjectReference:
                {
                    var obj = p.objectReferenceValue;
                    if (obj == null) return JValue.CreateNull();
                    return new JObject
                    {
                        ["$ref"] = obj.GetInstanceID(),
                        ["type"] = obj.GetType().Name,
                        ["name"] = obj.name ?? string.Empty,
                    };
                }
                case SerializedPropertyType.ArraySize:
                    return p.intValue;
                case SerializedPropertyType.Generic:
                {
                    if (p.isArray)
                    {
                        var arr = new JArray();
                        for (int i = 0; i < p.arraySize; i++)
                        {
                            arr.Add(DumpProperty(p.GetArrayElementAtIndex(i), visited, fullFidelity));
                        }
                        return arr;
                    }
                    return $"<unsupported: {p.type}>";
                }
                case SerializedPropertyType.AnimationCurve:
                    return fullFidelity ? DumpAnimationCurve(p.animationCurveValue) : (JToken)"<unsupported: AnimationCurve>";
                case SerializedPropertyType.Gradient:
                    return fullFidelity ? DumpGradient(GradientValueAccessor.Read(p)) : (JToken)"<unsupported: Gradient>";
                case SerializedPropertyType.ExposedReference:
                    return fullFidelity ? DumpExposedReference(p) : (JToken)"<unsupported: ExposedReference>";
                case SerializedPropertyType.ManagedReference:
                    return fullFidelity ? DumpManagedReference(p, visited, ManagedRefMaxDepth) : (JToken)"<unsupported: ManagedReference>";
                case SerializedPropertyType.FixedBufferSize:
                    return p.intValue;
                default:
                    return $"<unsupported: {p.propertyType}>";
            }
        }

        private static JToken DumpAnimationCurve(AnimationCurve curve)
        {
            if (curve == null) return JValue.CreateNull();
            var keys = new JArray();
            foreach (var k in curve.keys)
            {
                keys.Add(new JObject
                {
                    ["time"] = k.time,
                    ["value"] = k.value,
                    ["inTangent"] = k.inTangent,
                    ["outTangent"] = k.outTangent,
                    ["inWeight"] = k.inWeight,
                    ["outWeight"] = k.outWeight,
                    ["weightedMode"] = k.weightedMode.ToString(),
                });
            }
            return new JObject
            {
                ["$type"] = "AnimationCurve",
                ["keys"] = keys,
                ["preWrapMode"] = curve.preWrapMode.ToString(),
                ["postWrapMode"] = curve.postWrapMode.ToString(),
            };
        }

        private static JToken DumpGradient(Gradient g)
        {
            if (g == null) return JValue.CreateNull();
            var colorKeys = new JArray();
            foreach (var ck in g.colorKeys)
            {
                colorKeys.Add(new JObject
                {
                    ["color"] = new JArray(ck.color.r, ck.color.g, ck.color.b, ck.color.a),
                    ["time"] = ck.time,
                });
            }
            var alphaKeys = new JArray();
            foreach (var ak in g.alphaKeys)
            {
                alphaKeys.Add(new JObject
                {
                    ["alpha"] = ak.alpha,
                    ["time"] = ak.time,
                });
            }
            return new JObject
            {
                ["$type"] = "Gradient",
                ["colorKeys"] = colorKeys,
                ["alphaKeys"] = alphaKeys,
                ["mode"] = g.mode.ToString(),
            };
        }

        private static JToken DumpExposedReference(SerializedProperty p)
        {
            // ExposedReference<T> serializes as a child pair: exposedName (the lookup key) +
            // defaultValue (the fallback Object ref used when the name resolves to nothing).
            var exposedName = p.FindPropertyRelative("exposedName");
            var defaultValue = p.FindPropertyRelative("defaultValue");
            var result = new JObject { ["$type"] = "ExposedReference" };
            result["exposedName"] = exposedName != null ? (exposedName.stringValue ?? string.Empty) : string.Empty;
            if (defaultValue != null)
            {
                var obj = defaultValue.objectReferenceValue;
                result["defaultValue"] = obj == null
                    ? JValue.CreateNull()
                    : new JObject
                    {
                        ["$ref"] = obj.GetInstanceID(),
                        ["type"] = obj.GetType().Name,
                        ["name"] = obj.name ?? string.Empty,
                    };
            }
            else
            {
                result["defaultValue"] = JValue.CreateNull();
            }
            return result;
        }

        private static JToken DumpManagedReference(SerializedProperty p, HashSet<int> visited, int remainingDepth)
        {
            string typename = p.managedReferenceFullTypename ?? string.Empty;
            if (string.IsNullOrEmpty(typename))
            {
                // Null [SerializeReference] field — no boxed instance.
                return new JObject { ["$type"] = "ManagedReference", ["managedReferenceFullTypename"] = string.Empty, ["value"] = JValue.CreateNull() };
            }

            var result = new JObject
            {
                ["$type"] = "ManagedReference",
                ["managedReferenceFullTypename"] = typename,
            };

            // Cycle break: managedReferenceId is unique per boxed instance (2021.3+). A node we
            // have already entered, or one past the depth cap, emits its typename + a $truncated
            // marker so the typename is never orphaned from a silently-missing body.
            long refId = p.managedReferenceId;
            int refKey = unchecked((int)refId) ^ (int)(refId >> 32);
            if (remainingDepth <= 0 || (refId != ManagedReferenceUnknownId && !visited.Add(refKey)))
            {
                result["$truncated"] = remainingDepth <= 0 ? "depth" : "cycle";
                return result;
            }

            // Recurse over the boxed instance's serialized children via an independent copy
            // iterator constrained to this property's subtree.
            var fields = new JObject();
            var end = p.GetEndProperty();
            var iter = p.Copy();
            bool enter = true;
            while (iter.NextVisible(enter) && !SerializedProperty.EqualContents(iter, end))
            {
                enter = false;
                fields[iter.name] = DumpPropertyManaged(iter, visited, remainingDepth - 1);
            }
            result["value"] = fields;
            return result;
        }

        // Managed-reference children re-enter the full type switch, but ManagedReference leaves
        // among them must carry the decremented depth budget — so this thin wrapper exists rather
        // than calling DumpProperty (which always resets to ManagedRefMaxDepth).
        private static JToken DumpPropertyManaged(SerializedProperty p, HashSet<int> visited, int remainingDepth)
        {
            if (p.propertyType == SerializedPropertyType.ManagedReference)
            {
                return DumpManagedReference(p, visited, remainingDepth);
            }
            // Reached only on the full-fidelity path (managed-ref recursion never runs lossy),
            // so nested AnimationCurve/Gradient leaves inside the boxed instance serialize in full.
            return DumpProperty(p, visited, fullFidelity: true);
        }

        // SerializedProperty.managedReferenceId returns this sentinel for a property that does
        // not currently address a managed reference; treat it as "no id, don't dedupe".
        private const long ManagedReferenceUnknownId = -2L;

        /// <summary>
        /// Reads <c>Gradient</c> out of a <see cref="SerializedProperty"/>. Unity's
        /// <c>SerializedProperty.gradientValue</c> is <c>internal</c> (it has never been part of
        /// the public API, including the 2021.3 LTS floor), so it is reached via reflection —
        /// the established floor-safe pattern. Resolved once and cached; returns null if the
        /// property is ever removed (defensive — the dumper then emits a JSON null, never throws).
        /// </summary>
        private static class GradientValueAccessor
        {
            private static readonly PropertyInfo _prop =
                typeof(SerializedProperty).GetProperty(
                    "gradientValue",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);

            public static Gradient Read(SerializedProperty p)
            {
                if (p == null || _prop == null) return null;
                return _prop.GetValue(p, null) as Gradient;
            }
        }
    }
}
