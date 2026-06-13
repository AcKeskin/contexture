using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Tools.Editor;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// "What's actually on the player's screen" — the true final composited frame, including
    /// post-processing, ScreenSpace-Overlay UI, and stacked cameras, exactly as a player sees it.
    ///
    /// Two modes:
    /// <list type="bullet">
    /// <item><b>screen</b> (default) — <c>ScreenCapture.CaptureScreenshotAsTexture()</c> grabs the
    /// composited Game View frame. This is the ONLY path that includes ScreenSpace-Overlay
    /// canvases (they composite in the engine after all cameras — no camera render ever sees them)
    /// and full-screen post-FX. Requires Play Mode and a Game View; auto-enters Play Mode if stopped
    /// and stays in play.</item>
    /// <item><b>composite</b> — renders a single chosen camera (with its attached post-FX) to an
    /// offscreen RenderTexture via <see cref="CameraCapture"/>. Poseable, headless, works in edit or
    /// play mode — but does NOT include ScreenSpace-Overlay UI (use <c>screen</c> for that).</item>
    /// </list>
    ///
    /// For a single raw camera with no post-FX, prefer the cheaper <c>view_game</c>. For an
    /// arbitrary 6DoF viewpoint, use <c>view_scene_from</c>.
    /// </summary>
    [UnityMcpTool("view_screen")]
    internal sealed class ViewScreenTool : IUnityMcpTool
    {
        public string Name => "view_screen";

        public string Description =>
            "Capture the true final frame the player sees on screen — post-processing, " +
            "ScreenSpace-Overlay UI, and stacked cameras composited together. " +
            "mode='screen' (default): the literal Game View composite via ScreenCapture; " +
            "requires Play Mode (auto-enters if stopped and STAYS in play) and an open Game View. " +
            "mode='composite': renders a single camera + its post-FX to an offscreen texture " +
            "('cameraInstanceId' optional, defaults to the main camera); poseable/headless but " +
            "EXCLUDES ScreenSpace-Overlay UI. Optional 'width'/'height' (default 1280x720), " +
            "'timeoutMs' (screen-mode play-enter wait, default 10000), 'saveDirtyScenes' " +
            "(default true). Returns a PNG image content block.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["mode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "screen", "composite" },
                    ["default"] = "screen",
                },
                ["cameraInstanceId"] = new JObject
                {
                    ["type"] = "integer",
                    ["description"] = "composite mode only — GameObject or Camera instanceId to render; defaults to the main camera.",
                },
                ["width"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 1280 },
                ["height"] = new JObject { ["type"] = "integer", ["minimum"] = 16, ["maximum"] = 4096, ["default"] = 720 },
                ["timeoutMs"] = new JObject
                {
                    ["type"] = "integer",
                    ["minimum"] = PlayModeTransition.MinTimeoutMs,
                    ["maximum"] = PlayModeTransition.MaxTimeoutMs,
                    ["default"] = PlayModeTransition.DefaultTimeoutMs,
                },
                ["saveDirtyScenes"] = new JObject { ["type"] = "boolean", ["default"] = true },
            },
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var mode = @params.Value<string>("mode") ?? "screen";
            int width = Mathf.Clamp(@params["width"]?.Value<int>() ?? 1280, 16, 4096);
            int height = Mathf.Clamp(@params["height"]?.Value<int>() ?? 720, 16, 4096);

            switch (mode)
            {
                case "composite":
                    return CaptureComposite(@params, width, height);
                case "screen":
                    return await CaptureScreen(@params, width, height);
                default:
                    throw new ToolException("InvalidInput",
                        $"mode must be 'screen' or 'composite'; got '{mode}'.");
            }
        }

        // --- composite: offscreen camera render (poseable, headless, no overlay UI) ---

        private static ToolResult CaptureComposite(JObject @params, int width, int height)
        {
            Camera camera;
            var idToken = @params["cameraInstanceId"];
            if (idToken != null && idToken.Type != JTokenType.Null)
            {
                camera = ResolveCamera(idToken.Value<int>());
            }
            else
            {
                camera = CameraCapture.ResolveMainCamera();
                if (camera == null)
                    throw new ToolException("InvalidInput",
                        "view_screen(composite): no enabled Camera found. Pass 'cameraInstanceId' or " +
                        "add a camera tagged 'MainCamera' to the scene.");
            }

            byte[] png = CameraCapture.RenderCameraToPng(camera, width, height);
            return ToolResult.Png(png);
        }

        private static Camera ResolveCamera(int id)
        {
            #pragma warning disable CS0618 // EditorUtility.InstanceIDToObject — see InstanceIdResolver
            var obj = EditorUtility.InstanceIDToObject(id);
            #pragma warning restore CS0618
            if (obj is Camera cam) return cam;
            if (obj is GameObject go)
            {
                var goCam = go.GetComponent<Camera>();
                if (goCam != null) return goCam;
                throw new ToolException("InvalidInput",
                    $"cameraInstanceId {id} is a GameObject without a Camera component.");
            }
            throw new ToolException("InvalidInput",
                $"cameraInstanceId {id} did not resolve to a Camera.");
        }

        // --- screen: the true composited Game View frame ---

        private static async Task<ToolResult> CaptureScreen(JObject @params, int width, int height)
        {
            int timeoutMs = @params.Value<int?>("timeoutMs") ?? PlayModeTransition.DefaultTimeoutMs;
            bool saveDirtyScenes = @params.Value<bool?>("saveDirtyScenes") ?? true;

            // The composited frame only exists while Unity is rendering the Game View in
            // Play Mode. Enter play if stopped (or unpause) and stay there per the tool's
            // contract. paused→play is handled too: a paused player loop isn't producing
            // fresh frames.
            var current = PlayModeTransition.Observe();
            if (current != "play")
            {
                await PlayModeTransition.TransitionTo("play", timeoutMs, saveDirtyScenes);
            }

            // ScreenCapture grabs the LAST rendered Game View frame. Force a fresh render and
            // yield enough dispatcher ticks for the player loop + Game View repaint to land
            // before reading back.
            var gameView = FocusGameView();
            for (int i = 0; i < 3; i++)
            {
                EditorApplication.QueuePlayerLoopUpdate();
                gameView.Repaint();
                await Task.Yield();
            }

            Texture2D shot = null;
            try
            {
                shot = ScreenCapture.CaptureScreenshotAsTexture();
                if (shot == null || shot.width == 0 || shot.height == 0)
                    throw new ToolException("ToolError",
                        "ScreenCapture returned an empty frame. Ensure a Game View is open and Play Mode is rendering.");

                // ScreenCapture returns at Game-View resolution. Rescale to the requested
                // size only when it differs, so the agent gets a predictable image size.
                if (shot.width != width || shot.height != height)
                    shot = Rescale(shot, width, height);

                return ToolResult.Png(shot.EncodeToPNG());
            }
            finally
            {
                if (shot != null) UnityEngine.Object.DestroyImmediate(shot);
            }
        }

        private static EditorWindow FocusGameView()
        {
            // GameView is internal; resolve it by type name. GetWindow(type, ...) focuses an
            // existing Game View or creates one, so ScreenCapture has a live target. It never
            // returns null — the real headless-failure surface is an empty ScreenCapture frame,
            // handled by the caller.
            var gameViewType = typeof(UnityEditor.Editor).Assembly.GetType("UnityEditor.GameView");
            if (gameViewType == null)
                throw new ToolException("ToolError", "Could not resolve UnityEditor.GameView type.");

            return EditorWindow.GetWindow(gameViewType, false, "Game", focus: true);
        }

        private static Texture2D Rescale(Texture2D src, int width, int height)
        {
            var rt = RenderTexture.GetTemporary(width, height, 0, RenderTextureFormat.ARGB32);
            var prevActive = RenderTexture.active;
            Texture2D dst = null;
            try
            {
                Graphics.Blit(src, rt);
                RenderTexture.active = rt;
                dst = new Texture2D(width, height, TextureFormat.RGB24, mipChain: false);
                dst.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                dst.Apply();
            }
            finally
            {
                RenderTexture.active = prevActive;
                RenderTexture.ReleaseTemporary(rt);
                UnityEngine.Object.DestroyImmediate(src);
            }
            return dst;
        }
    }
}
