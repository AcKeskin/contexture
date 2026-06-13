using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Dumps a Component's serialized fields into a JSON object. Lossy by design:
    /// supports primitives, Vector*, Color, Quaternion, enums, and Object refs (rendered
    /// as { "$ref": instanceId, "name": "..." }). Unsupported types render as
    /// "&lt;unsupported: TypeName&gt;" rather than silently dropping.
    ///
    /// Reads via SerializedObject so the result matches what the inspector sees,
    /// including [SerializeField] private members.
    /// </summary>
    internal static class SerializedFieldDumper
    {
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

        public static JObject DumpComponent(Component comp, HashSet<int> visited)
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
                    result[prop.name] = DumpProperty(prop, visited);
                }
            }
            return result;
        }

        private static JToken DumpProperty(SerializedProperty p, HashSet<int> visited)
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
                            arr.Add(DumpProperty(p.GetArrayElementAtIndex(i), visited));
                        }
                        return arr;
                    }
                    return $"<unsupported: {p.type}>";
                }
                case SerializedPropertyType.AnimationCurve:
                    return "<unsupported: AnimationCurve>";
                case SerializedPropertyType.Gradient:
                    return "<unsupported: Gradient>";
                case SerializedPropertyType.ExposedReference:
                case SerializedPropertyType.FixedBufferSize:
                case SerializedPropertyType.ManagedReference:
                    return $"<unsupported: {p.propertyType}>";
                default:
                    return $"<unsupported: {p.propertyType}>";
            }
        }
    }
}
