using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// Renders N frames orbiting a target point or GameObject. Returns a single response
    /// with N PNG content blocks. Cap at 12 frames so the wire payload stays sane.
    /// </summary>
    [UnityMcpTool("view_scene_orbit")]
    internal sealed class ViewSceneOrbitTool : IUnityMcpTool
    {
        private const int MaxFrames = 12;

        public string Name => "view_scene_orbit";

        public string Description =>
            "Render N frames orbiting a target. 'target' is { instanceId } or [x,y,z]. " +
            "'radius' (default 3), 'pitchAngles' degrees (default [0]), 'yawAngles' degrees " +
            "(default 8 evenly-spaced). 'width'/'height' default 640/360. N is " +
            "pitchAngles.length * yawAngles.length, capped at 12.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["target"] = new JObject
                {
                    ["description"] = "Either { instanceId: <int> } or [x, y, z].",
                },
                ["radius"] = new JObject { ["type"] = "number", ["minimum"] = 0.01, ["default"] = 3 },
                ["pitchAngles"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                },
                ["yawAngles"] = new JObject
                {
                    ["type"] = "array",
                    ["items"] = new JObject { ["type"] = "number" },
                },
                ["fov"] = new JObject { ["type"] = "number", ["minimum"] = 1, ["maximum"] = 179, ["default"] = 60 },
                ["width"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 2048, ["default"] = 640 },
                ["height"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 2048, ["default"] = 360 },
            },
            ["required"] = new JArray { "target" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            Vector3 target = ResolveTarget(@params["target"]);
            float radius = @params["radius"]?.Value<float>() ?? 3f;
            float fov = @params["fov"]?.Value<float>() ?? 60f;
            int width = Mathf.Clamp(@params["width"]?.Value<int>() ?? 640, 16, 2048);
            int height = Mathf.Clamp(@params["height"]?.Value<int>() ?? 360, 16, 2048);

            var pitches = ParseAngles(@params["pitchAngles"] as JArray, defaultValue: new[] { 0f });
            var yaws = ParseAngles(@params["yawAngles"] as JArray, defaultValue: DefaultYaws());

            int total = pitches.Length * yaws.Length;
            if (total == 0)
            {
                throw new ArgumentException("Orbit requires at least one pitch and one yaw angle.");
            }
            if (total > MaxFrames)
            {
                throw new ArgumentException(
                    $"Orbit produces {total} frames; cap is {MaxFrames}. Reduce pitchAngles/yawAngles.");
            }

            var frames = new List<byte[]>(total);
            foreach (var pitch in pitches)
            {
                foreach (var yaw in yaws)
                {
                    var rot = Quaternion.Euler(pitch, yaw, 0f);
                    var camPos = target + rot * (Vector3.back * radius);
                    var lookAtArr = new JArray(target.x, target.y, target.z);
                    var png = ViewSceneFromTool.CaptureFrom(camPos, lookAtArr, null, fov, width, height);
                    frames.Add(png);
                }
            }

            // ToolResult shape doesn't yet support multi-image responses on the wire envelope
            // (one contentType per result). For v2 we encode the orbit as a JSON wrapper holding
            // base64 PNGs — the server's translate-to-MCP layer (Step 24+) can later peel the
            // array out into N image content blocks.
            var pngs = new JArray();
            foreach (var f in frames) pngs.Add(Convert.ToBase64String(f));

            var data = new JObject
            {
                ["frameCount"] = frames.Count,
                ["target"] = new JArray(target.x, target.y, target.z),
                ["radius"] = radius,
                ["fov"] = fov,
                ["width"] = width,
                ["height"] = height,
                ["pngs"] = pngs,
            };
            return Task.FromResult(ToolResult.Json(data));
        }

        private static Vector3 ResolveTarget(JToken token)
        {
            if (token == null) throw new ArgumentException("'target' is required.");

            if (token is JArray arr)
            {
                return Vector3Json.ParseRequired(arr, "target");
            }
            if (token is JObject obj)
            {
                if (obj["instanceId"]?.Type == JTokenType.Integer)
                {
                    int id = obj.Value<int>("instanceId");
                    var go = InstanceIdResolver.GameObjectOrThrow(id, "target.instanceId");
                    return go.transform.position;
                }
            }
            throw new ArgumentException("'target' must be [x,y,z] or { instanceId: <int> }.");
        }

        private static float[] ParseAngles(JArray a, float[] defaultValue)
        {
            if (a == null || a.Count == 0) return defaultValue;
            var result = new float[a.Count];
            for (int i = 0; i < a.Count; i++) result[i] = a[i].Value<float>();
            return result;
        }

        private static float[] DefaultYaws()
        {
            // 8 evenly-spaced yaws from 0 to 315 degrees.
            return new float[] { 0, 45, 90, 135, 180, 225, 270, 315 };
        }
    }
}
