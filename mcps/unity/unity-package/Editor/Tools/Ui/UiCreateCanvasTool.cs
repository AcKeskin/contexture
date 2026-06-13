using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Tools.UiToolkit;

namespace UnityMcp.Editor.Tools.Ui
{
    /// <summary>
    /// Composite factory for a Unity Canvas. Creates one GameObject with
    /// RectTransform + Canvas + CanvasScaler + GraphicRaycaster wired and
    /// returns all four instanceIds in a single tool call (replaces a 4-call
    /// go_create + 3× component_add sequence + property writes).
    ///
    /// Render modes:
    /// - <c>screen-overlay</c> → ScreenSpaceOverlay
    /// - <c>screen-camera</c> → ScreenSpaceCamera (caller assigns the worldCamera
    ///   via component_set_property afterwards if needed)
    /// - <c>world</c> → WorldSpace, no scale change
    /// - <c>world-mrtk</c> → WorldSpace with the MRTK 3 convention applied:
    ///   transform.localScale = (0.001, 0.001, 0.001) and rect sizeDelta
    ///   derived from <c>sizeMm</c> (after scale, 1 world unit = 1 mm).
    ///
    /// Scaler:
    /// - <c>constant-pixel-size</c> / <c>scale-with-screen-size</c> /
    ///   <c>constant-physical-size</c> map to CanvasScaler.uiScaleMode.
    /// - null = leave Unity's default for the render mode.
    /// </summary>
    [UnityMcpTool("ui_create_canvas", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UiCreateCanvasTool : IUnityMcpTool
    {
        public string Name => "ui_create_canvas";

        public string Description =>
            "PREFER THIS over go_create + component_add×3 + property writes for any " +
            "UI Canvas. Creates GameObject + RectTransform + Canvas + CanvasScaler + " +
            "GraphicRaycaster in one call (compresses ~5-8 calls to 1). renderMode: " +
            "screen-overlay | screen-camera | world | world-mrtk (WorldSpace + scale " +
            "0.001 + sizeDelta from sizeMm). scaler: constant-pixel-size | " +
            "scale-with-screen-size | constant-physical-size | null. parentInstanceId " +
            "null = scene root. Returns instanceIds for the GO and each of the 4 " +
            "components. Note: GameObject/UI/* menu items need Hierarchy focus and " +
            "WILL fail headlessly — use this instead.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["name"] = new JObject { ["type"] = "string" },
                ["renderMode"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "screen-overlay", "screen-camera", "world", "world-mrtk" },
                },
                ["scaler"] = new JObject
                {
                    ["type"] = new JArray { "string", "null" },
                    ["enum"] = new JArray { "constant-pixel-size", "scale-with-screen-size", "constant-physical-size", null },
                },
                ["sizeMm"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 2,
                    ["maxItems"] = 2,
                },
                ["parentInstanceId"] = new JObject { ["type"] = new JArray { "integer", "null" } },
            },
            ["required"] = new JArray { "name", "renderMode" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var renderMode = @params.Value<string>("renderMode");
            if (string.IsNullOrEmpty(renderMode))
                throw new ToolException("InvalidInput", "'renderMode' is required.");

            var scaler = @params.Value<string>("scaler");
            var sizeMm = @params["sizeMm"] as JArray;
            var parentToken = @params["parentInstanceId"];
            int? parentId = parentToken != null && parentToken.Type != JTokenType.Null ? parentToken.Value<int?>() : null;

            GameObject parent = null;
            if (parentId.HasValue)
                parent = InstanceIdResolver.GameObjectOrThrow(parentId.Value, "parentInstanceId");

            // Mixed-system guard: a UGUI Canvas must not be nested under a UI Toolkit UIDocument.
            UiSystemGuard.AssertNotUnderUIDocument(parent);

            var go = new GameObject(name, typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            if (parent != null)
                go.transform.SetParent(parent.transform, worldPositionStays: false);

            var rt = go.GetComponent<RectTransform>();
            var canvas = go.GetComponent<Canvas>();
            var canvasScaler = go.GetComponent<CanvasScaler>();
            var raycaster = go.GetComponent<GraphicRaycaster>();

            ConfigureRenderMode(go, canvas, rt, renderMode, sizeMm);
            ConfigureScaler(canvasScaler, scaler);

            Undo.RegisterCreatedObjectUndo(go, $"ui_create_canvas({name})");

            return Task.FromResult(ToolResult.Json(new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["rectTransformInstanceId"] = rt.GetInstanceID(),
                ["canvasInstanceId"] = canvas.GetInstanceID(),
                ["scalerInstanceId"] = canvasScaler.GetInstanceID(),
                ["graphicRaycasterInstanceId"] = raycaster.GetInstanceID(),
                ["renderMode"] = renderMode,
            }));
        }

        private static void ConfigureRenderMode(GameObject go, Canvas canvas, RectTransform rt, string renderMode, JArray sizeMm)
        {
            switch (renderMode)
            {
                case "screen-overlay":
                    canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                    break;
                case "screen-camera":
                    canvas.renderMode = RenderMode.ScreenSpaceCamera;
                    // worldCamera left null — caller assigns via component_set_property if needed.
                    break;
                case "world":
                    canvas.renderMode = RenderMode.WorldSpace;
                    break;
                case "world-mrtk":
                    canvas.renderMode = RenderMode.WorldSpace;
                    go.transform.localScale = new Vector3(0.001f, 0.001f, 0.001f);
                    if (sizeMm != null && sizeMm.Count == 2)
                    {
                        // After scale=0.001, 1 world unit = 1 mm. sizeDelta is in world-units
                        // before the localScale, so we want sizeDelta = sizeMm directly (Unity
                        // treats RectTransform sizeDelta in local space, pre-scale).
                        rt.sizeDelta = new Vector2(sizeMm[0].Value<float>(), sizeMm[1].Value<float>());
                    }
                    break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown renderMode '{renderMode}'. Valid: screen-overlay, screen-camera, world, world-mrtk.");
            }
        }

        private static void ConfigureScaler(CanvasScaler scaler, string scalerMode)
        {
            if (string.IsNullOrEmpty(scalerMode)) return;    // leave Unity's default
            switch (scalerMode)
            {
                case "constant-pixel-size":
                    scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize;
                    break;
                case "scale-with-screen-size":
                    scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                    break;
                case "constant-physical-size":
                    scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPhysicalSize;
                    break;
                default:
                    throw new ToolException("InvalidInput",
                        $"Unknown scaler '{scalerMode}'. Valid: constant-pixel-size, scale-with-screen-size, constant-physical-size, null.");
            }
        }
    }
}
