using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.GameObjects
{
    /// <summary>
    /// Sets position / rotation / scale on a GameObject's transform. Each axis is optional —
    /// only fields supplied are written. 'space' is 'local' (default) or 'world'. Goes through
    /// SerializedObject so Undo records and inspectors update.
    /// </summary>
    [UnityMcpTool("go_set_transform")]
    internal sealed class GoSetTransformTool : IUnityMcpTool
    {
        public string Name => "go_set_transform";

        public string Description =>
            "Set transform fields on a GameObject. Optional 'position'/'rotation'/'scale' arrays — " +
            "only those passed are written. 'rotation' is a quaternion [x,y,z,w] when length 4, or " +
            "Euler [x,y,z] when length 3. 'space' is 'local' (default) or 'world'. " +
            "Registers Undo.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["instanceId"] = new JObject { ["type"] = "integer" },
                ["space"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "local", "world" },
                    ["default"] = "local",
                },
                ["position"] = ArrayOfNumbers(3, 3),
                ["rotation"] = ArrayOfNumbers(3, 4),
                ["scale"] = ArrayOfNumbers(3, 3),
            },
            ["required"] = new JArray { "instanceId" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int id = @params.Value<int?>("instanceId")
                ?? throw new ArgumentException("'instanceId' is required.");

            var go = InstanceIdResolver.GameObjectOrThrow(id);

            bool worldSpace = (@params.Value<string>("space") ?? "local") == "world";

            Undo.RecordObject(go.transform, "Unity MCP: Set Transform");

            JArray posArr = @params["position"] as JArray;
            JArray rotArr = @params["rotation"] as JArray;
            JArray scaleArr = @params["scale"] as JArray;

            if (posArr != null)
            {
                var v = Vector3Json.ParseRequired(posArr, "position");
                if (worldSpace) go.transform.position = v;
                else go.transform.localPosition = v;
            }
            if (rotArr != null)
            {
                if (rotArr.Count == 4)
                {
                    var q = new Quaternion(
                        rotArr[0].Value<float>(), rotArr[1].Value<float>(),
                        rotArr[2].Value<float>(), rotArr[3].Value<float>());
                    if (worldSpace) go.transform.rotation = q;
                    else go.transform.localRotation = q;
                }
                else if (rotArr.Count == 3)
                {
                    var e = Vector3Json.ParseRequired(rotArr, "rotation");
                    if (worldSpace) go.transform.eulerAngles = e;
                    else go.transform.localEulerAngles = e;
                }
                else
                {
                    throw new ArgumentException("'rotation' must be length 3 (Euler) or 4 (quaternion).");
                }
            }
            if (scaleArr != null)
            {
                // Unity has no world-scale setter; scale is always local. Note in result.
                go.transform.localScale = Vector3Json.ParseRequired(scaleArr, "scale");
            }

            EditorUtility.SetDirty(go.transform);

            var data = new JObject
            {
                ["instanceId"] = id,
                ["space"] = worldSpace ? "world" : "local",
                ["localPosition"] = Vector3Json.ToJson(go.transform.localPosition),
                ["localRotation"] = Vector3Json.ToJson(go.transform.localRotation),
                ["localScale"] = Vector3Json.ToJson(go.transform.localScale),
                ["worldPosition"] = Vector3Json.ToJson(go.transform.position),
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static JObject ArrayOfNumbers(int min, int max) => new JObject
        {
            ["type"] = "array",
            ["items"] = new JObject { ["type"] = "number" },
            ["minItems"] = min,
            ["maxItems"] = max,
        };
    }
}
