using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// Renders the scene from an arbitrary 6DoF pose. Spawns an editor-only temp camera,
    /// positions it, captures, and destroys it — never touches user cameras. Pose can be
    /// expressed as position+lookAt, position+rotation (quaternion or Euler), or both
    /// (rotation wins when supplied).
    /// </summary>
    [UnityMcpTool("view_scene_from")]
    internal sealed class ViewSceneFromTool : IUnityMcpTool
    {
        public string Name => "view_scene_from";

        public string Description =>
            "Render the scene from an arbitrary pose. 'position' [x,y,z] required. " +
            "Orientation by 'lookAt' [x,y,z] OR 'rotation' (quaternion [x,y,z,w] or Euler [x,y,z]). " +
            "Optional 'fov' (default 60), 'width' (default 1280), 'height' (default 720). " +
            "Returns one PNG content block.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["position"] = ArrayOfNumbers(3, 3),
                ["lookAt"] = ArrayOfNumbers(3, 3),
                ["rotation"] = ArrayOfNumbers(3, 4),
                ["fov"] = new JObject
                {
                    ["type"] = "number",
                    ["minimum"] = 1,
                    ["maximum"] = 179,
                    ["default"] = 60,
                },
                ["width"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 1280 },
                ["height"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 720 },
            },
            ["required"] = new JArray { "position" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var pos = Vector3Json.ParseRequired(@params["position"] as JArray, "position");
            var lookAtArr = @params["lookAt"] as JArray;
            var rotArr = @params["rotation"] as JArray;
            float fov = @params["fov"]?.Value<float>() ?? 60f;
            int width = Mathf.Clamp(@params["width"]?.Value<int>() ?? 1280, 16, 4096);
            int height = Mathf.Clamp(@params["height"]?.Value<int>() ?? 720, 16, 4096);

            byte[] png = CaptureFrom(pos, lookAtArr, rotArr, fov, width, height);
            return Task.FromResult(ToolResult.Png(png));
        }

        internal static byte[] CaptureFrom(Vector3 pos, JArray lookAtArr, JArray rotArr, float fov, int width, int height)
        {
            // hideFlags + DontSave: keep the temp camera off the hierarchy + scene save.
            var go = new GameObject("__UnityMcp_ViewSceneFrom__");
            go.hideFlags = HideFlags.HideAndDontSave;
            try
            {
                var cam = go.AddComponent<Camera>();
                cam.clearFlags = CameraClearFlags.Skybox;
                cam.fieldOfView = fov;
                cam.nearClipPlane = 0.01f;
                cam.farClipPlane = 1000f;
                cam.transform.position = pos;

                if (rotArr != null)
                {
                    if (rotArr.Count == 4)
                    {
                        cam.transform.rotation = new Quaternion(
                            rotArr[0].Value<float>(), rotArr[1].Value<float>(),
                            rotArr[2].Value<float>(), rotArr[3].Value<float>());
                    }
                    else if (rotArr.Count == 3)
                    {
                        cam.transform.eulerAngles = Vector3Json.ParseRequired(rotArr, "rotation");
                    }
                    else
                    {
                        throw new ArgumentException("'rotation' must be length 3 (Euler) or 4 (quaternion).");
                    }
                }
                else if (lookAtArr != null)
                {
                    var target = Vector3Json.ParseRequired(lookAtArr, "lookAt");
                    cam.transform.LookAt(target, Vector3.up);
                }
                else
                {
                    cam.transform.rotation = Quaternion.identity;
                }

                return CameraCapture.RenderCameraToPng(cam, width, height);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(go);
            }
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
