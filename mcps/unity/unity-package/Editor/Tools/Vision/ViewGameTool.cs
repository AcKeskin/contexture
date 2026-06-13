using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// Renders the active scene's main camera (or first enabled camera) into a PNG and
    /// returns it as image content. Edit-mode safe — captures via temporary RenderTexture
    /// rather than the Game View. Shared capture path lives in CameraCapture.
    /// </summary>
    [UnityMcpTool("view_game")]
    internal sealed class ViewGameTool : IUnityMcpTool
    {
        public string Name => "view_game";

        public string Description =>
            "Render the active scene's main camera (or first enabled camera) to a PNG and " +
            "return it inline. Optional 'width'/'height' override the capture resolution " +
            "(defaults to 1280x720). Returns a PNG image MCP content block.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["width"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 16,
                    ["maximum"] = 4096,
                    ["default"] = 1280,
                },
                ["height"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = 16,
                    ["maximum"] = 4096,
                    ["default"] = 720,
                },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int width = @params["width"]?.Value<int>() ?? 1280;
            int height = @params["height"]?.Value<int>() ?? 720;
            width = Mathf.Clamp(width, 16, 4096);
            height = Mathf.Clamp(height, 16, 4096);

            var camera = CameraCapture.ResolveMainCamera();
            if (camera == null)
            {
                throw new InvalidOperationException(
                    "view_game: no enabled Camera found in any loaded scene. Add a camera tagged 'MainCamera' " +
                    "or any enabled Camera component to the scene.");
            }

            byte[] png = CameraCapture.RenderCameraToPng(camera, width, height);
            return Task.FromResult(ToolResult.Png(png));
        }
    }
}
