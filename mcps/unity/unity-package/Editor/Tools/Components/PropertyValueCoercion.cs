using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Components
{
    /// <summary>
    /// Coerces a JSON value into a SerializedProperty's expected type and writes it.
    /// Returns true when the property was set; throws ArgumentException on shape mismatch
    /// and CoercionUnsupportedException for property types this version doesn't handle.
    /// </summary>
    internal static class PropertyValueCoercion
    {
        public sealed class CoercionUnsupportedException : Exception
        {
            public string UnsupportedType { get; }
            public CoercionUnsupportedException(string unsupportedType, string message)
                : base(message)
            {
                UnsupportedType = unsupportedType;
            }
        }

        public static void Apply(SerializedProperty p, JToken value)
        {
            if (p == null) throw new ArgumentNullException(nameof(p));

            switch (p.propertyType)
            {
                case SerializedPropertyType.Integer:
                case SerializedPropertyType.LayerMask:
                    p.intValue = value.Value<int>();
                    return;
                case SerializedPropertyType.Boolean:
                    p.boolValue = value.Value<bool>();
                    return;
                case SerializedPropertyType.Float:
                    p.floatValue = value.Value<float>();
                    return;
                case SerializedPropertyType.String:
                    p.stringValue = value.Value<string>() ?? string.Empty;
                    return;
                case SerializedPropertyType.Color:
                {
                    var arr = ExpectArray(value, 3, 4, "Color");
                    p.colorValue = new Color(
                        arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>(),
                        arr.Count == 4 ? arr[3].Value<float>() : 1f);
                    return;
                }
                case SerializedPropertyType.Vector2:
                {
                    var arr = ExpectArray(value, 2, 2, "Vector2");
                    p.vector2Value = new Vector2(arr[0].Value<float>(), arr[1].Value<float>());
                    return;
                }
                case SerializedPropertyType.Vector3:
                {
                    var arr = ExpectArray(value, 3, 3, "Vector3");
                    p.vector3Value = new Vector3(arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>());
                    return;
                }
                case SerializedPropertyType.Vector4:
                {
                    var arr = ExpectArray(value, 4, 4, "Vector4");
                    p.vector4Value = new Vector4(
                        arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>(), arr[3].Value<float>());
                    return;
                }
                case SerializedPropertyType.Quaternion:
                {
                    var arr = ExpectArray(value, 4, 4, "Quaternion");
                    p.quaternionValue = new Quaternion(
                        arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>(), arr[3].Value<float>());
                    return;
                }
                case SerializedPropertyType.Enum:
                {
                    if (value.Type == JTokenType.String)
                    {
                        var name = value.Value<string>();
                        var idx = Array.IndexOf(p.enumNames ?? Array.Empty<string>(), name);
                        if (idx < 0)
                        {
                            throw new ArgumentException(
                                $"Enum value '{name}' not in [{string.Join(",", p.enumNames ?? Array.Empty<string>())}].");
                        }
                        p.enumValueIndex = idx;
                        return;
                    }
                    p.intValue = value.Value<int>();
                    return;
                }
                case SerializedPropertyType.ObjectReference:
                {
                    // Normalize first: object-reference values frequently arrive as a JSON
                    // *string* rather than the intended integer / object — an LLM may emit
                    // "50370" or "{\"$guid\":\"...\"}", and some MCP clients stringify nested
                    // argument values on the wire. The primitive branches above tolerate this
                    // implicitly (JToken.Value<int>() coerces "5" -> 5); the object-ref branch
                    // must do it explicitly. NormalizeObjectRefToken unwraps a stringified
                    // payload back into the integer / JObject the rest of this branch expects.
                    var token = NormalizeObjectRefToken(value);

                    if (token == null || token.Type == JTokenType.Null)
                    {
                        p.objectReferenceValue = null;
                        return;
                    }
                    p.objectReferenceValue = ResolveObjectReference(token);
                    return;
                }
                case SerializedPropertyType.AnimationCurve:
                    throw new CoercionUnsupportedException("AnimationCurve",
                        "AnimationCurve values are not supported by component_set_property in v2.");
                case SerializedPropertyType.Gradient:
                    throw new CoercionUnsupportedException("Gradient",
                        "Gradient values are not supported by component_set_property in v2.");
                case SerializedPropertyType.ManagedReference:
                    throw new CoercionUnsupportedException("ManagedReference",
                        "[SerializeReference] values are not supported by component_set_property in v2.");
                default:
                    throw new CoercionUnsupportedException(p.propertyType.ToString(),
                        $"Property type {p.propertyType} is not supported by component_set_property in v2.");
            }
        }

        /// <summary>
        /// If the incoming token is a JSON string, attempt to recover the integer or
        /// JObject it was meant to be (the common LLM / MCP-client stringification slip).
        /// A non-string token passes through unchanged. Returns null for an empty string
        /// (treated as "clear the reference").
        /// </summary>
        private static JToken NormalizeObjectRefToken(JToken value)
        {
            if (value == null) return null;
            if (value.Type != JTokenType.String) return value;

            var s = value.Value<string>()?.Trim();
            if (string.IsNullOrEmpty(s)) return null;

            // "{...}" — a stringified object form ({$ref}/{$guid}/{$path}).
            if (s.Length > 0 && (s[0] == '{' || s[0] == '['))
            {
                try { return JToken.Parse(s); }
                catch (Exception ex)
                {
                    throw new ArgumentException(
                        $"Object reference value looked like JSON but failed to parse: {ex.Message}. Received string: {Preview(s)}.");
                }
            }

            // "50370" — a stringified instanceId.
            if (int.TryParse(s, out var id)) return new JValue(id);

            // A bare GUID (32 hex chars, optionally hyphenated) — treat as an asset $guid.
            var compact = s.Replace("-", string.Empty);
            if (compact.Length == 32 && IsHex(compact))
                return new JObject { ["$guid"] = s };

            // Anything else that looks like a project path — treat as $path.
            if (s.IndexOf('/') >= 0 || s.EndsWith(".asset", StringComparison.OrdinalIgnoreCase))
                return new JObject { ["$path"] = s };

            throw new ArgumentException(
                "Object reference value must be an instanceId integer, null, { $ref: <int> }, " +
                "{ $guid: \"<guid>\" }, or { $path: \"<asset-path>\" }. " +
                $"Received a string that matched none of these: {Preview(s)}.");
        }

        /// <summary>
        /// Resolve a normalized object-reference token (integer instanceId or a
        /// { $ref | $guid | $path } JObject) to the live Unity Object. Diagnostic errors
        /// always report what was actually received so a failure is debuggable in one pass.
        /// </summary>
        private static UnityEngine.Object ResolveObjectReference(JToken token)
        {
            if (token.Type == JTokenType.Integer)
            {
                int id = token.Value<int>();
                #pragma warning disable CS0618 // InstanceIDToObject deprecation; see InstanceIdResolver.cs
                var obj = EditorUtility.InstanceIDToObject(id);
                #pragma warning restore CS0618
                if (obj == null)
                    throw new ArgumentException($"instanceId {id} did not resolve to a Unity Object.");
                return obj;
            }

            if (token is JObject jo)
            {
                if (jo["$ref"] != null)
                {
                    if (jo["$ref"].Type != JTokenType.Integer && !int.TryParse(jo["$ref"].ToString(), out _))
                        throw new ArgumentException($"$ref must be an integer instanceId; got {Preview(jo["$ref"].ToString())}.");
                    int id = jo["$ref"].Value<int>();
                    #pragma warning disable CS0618
                    var obj = EditorUtility.InstanceIDToObject(id);
                    #pragma warning restore CS0618
                    if (obj == null)
                        throw new ArgumentException($"$ref instanceId {id} did not resolve to a Unity Object.");
                    return obj;
                }
                if (jo["$guid"]?.Type == JTokenType.String)
                {
                    string guid = jo.Value<string>("$guid");
                    string assetPath = AssetDatabase.GUIDToAssetPath(guid);
                    if (string.IsNullOrEmpty(assetPath))
                        throw new ArgumentException($"$guid '{guid}' did not resolve to an asset path.");
                    var obj = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(assetPath);
                    if (obj == null)
                        throw new ArgumentException($"$guid '{guid}' resolved to path '{assetPath}' but the asset failed to load.");
                    return obj;
                }
                if (jo["$path"]?.Type == JTokenType.String)
                {
                    string assetPath = jo.Value<string>("$path");
                    var obj = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(assetPath);
                    if (obj == null)
                        throw new ArgumentException($"$path '{assetPath}' did not resolve to a Unity Object.");
                    return obj;
                }
                throw new ArgumentException(
                    "Object reference object must contain one of { $ref: <int> }, { $guid: \"<guid>\" }, " +
                    $"or {{ $path: \"<asset-path>\" }}. Received keys: [{string.Join(", ", PropertyNames(jo))}].");
            }

            throw new ArgumentException(
                "Object reference value must be an instanceId integer, null, { $ref: <int> }, " +
                "{ $guid: \"<guid>\" }, or { $path: \"<asset-path>\" }. " +
                $"Received {token.Type}: {Preview(token.ToString())}.");
        }

        private static bool IsHex(string s)
        {
            foreach (var c in s)
            {
                bool hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                if (!hex) return false;
            }
            return true;
        }

        private static IEnumerable<string> PropertyNames(JObject jo)
        {
            foreach (var prop in jo.Properties()) yield return prop.Name;
        }

        private static string Preview(string s)
        {
            if (s == null) return "<null>";
            const int max = 80;
            return s.Length <= max ? $"'{s}'" : $"'{s.Substring(0, max)}…'";
        }

        private static JArray ExpectArray(JToken value, int min, int max, string label)
        {
            if (!(value is JArray arr))
                throw new ArgumentException($"{label} expects array; got {value?.Type}.");
            if (arr.Count < min || arr.Count > max)
                throw new ArgumentException(
                    $"{label} expects array of length {(min == max ? min.ToString() : $"{min}-{max}")}; got {arr.Count}.");
            return arr;
        }
    }
}
