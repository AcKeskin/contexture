using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools
{
    /// <summary>
    /// Vector3/Quaternion JSON round-trip helpers. Eliminates the
    /// `new Vector3(arr[0].Value&lt;float&gt;(), …)` pattern repeated across tools.
    /// </summary>
    internal static class Vector3Json
    {
        /// <summary>Parse [x,y,z]; null/wrong-length → throws ToolException InvalidInput.</summary>
        public static Vector3 ParseRequired(JArray arr, string fieldName)
        {
            if (arr == null || arr.Count != 3)
            {
                throw new ToolException("InvalidInput",
                    $"'{fieldName}' must be [x,y,z] of 3 numbers.");
            }
            return new Vector3(arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>());
        }

        /// <summary>Parse [x,y,z]; null/wrong-length → returns null (caller decides).</summary>
        public static Vector3? TryParse(JArray arr)
        {
            if (arr == null || arr.Count != 3) return null;
            return new Vector3(arr[0].Value<float>(), arr[1].Value<float>(), arr[2].Value<float>());
        }

        public static JArray ToJson(Vector3 v) => new JArray(v.x, v.y, v.z);
        public static JArray ToJson(Quaternion q) => new JArray(q.x, q.y, q.z, q.w);
    }
}
