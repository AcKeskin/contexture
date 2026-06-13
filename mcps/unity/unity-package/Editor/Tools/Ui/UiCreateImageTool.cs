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
    /// Composite factory for a UGUI Image element. Creates a GameObject under
    /// <c>parentInstanceId</c> with RectTransform + Image, configured from
    /// params. Sprite resolves from either an instanceId or an asset path.
    /// </summary>
    [UnityMcpTool("ui_create_image", Requires = new[] { CapabilityKey.Ugui })]
    internal sealed class UiCreateImageTool : IUnityMcpTool
    {
        public string Name => "ui_create_image";

        public string Description =>
            "Create a GameObject with RectTransform + UnityEngine.UI.Image in one call. " +
            "sprite: integer (instanceId) | string (asset path) | null. color: [r,g,b,a] | null. " +
            "type: simple | sliced | tiled | filled | null. Optional layoutElement: { minWidth?, " +
            "minHeight?, preferredWidth?, preferredHeight?, flexibleWidth?, flexibleHeight? } " +
            "adds + configures a LayoutElement. parentInstanceId is required.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["parentInstanceId"] = new JObject { ["type"] = "integer" },
                ["name"] = new JObject { ["type"] = "string" },
                ["sprite"] = new JObject { ["type"] = new JArray { "integer", "string", "null" } },
                ["color"] = new JObject
                {
                    ["type"] = new JArray { "array", "null" },
                    ["items"] = new JObject { ["type"] = "number" },
                    ["minItems"] = 3,
                    ["maxItems"] = 4,
                },
                ["type"] = new JObject
                {
                    ["type"] = new JArray { "string", "null" },
                    ["enum"] = new JArray { "simple", "sliced", "tiled", "filled", null },
                },
                ["layoutElement"] = new JObject
                {
                    ["type"] = new JArray { "object", "null" },
                    ["additionalProperties"] = true,
                },
            },
            ["required"] = new JArray { "parentInstanceId", "name" },
            ["additionalProperties"] = false,
        }.AddAnchorPresetProps();

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            int parentId = @params.Value<int?>("parentInstanceId")
                ?? throw new ToolException("InvalidInput", "'parentInstanceId' is required.");
            var parent = InstanceIdResolver.GameObjectOrThrow(parentId, "parentInstanceId");

            // Mixed-system guard: UGUI content must not live under a UI Toolkit UIDocument.
            UiSystemGuard.AssertNotUnderUIDocument(parent);

            var name = @params.Value<string>("name");
            if (string.IsNullOrEmpty(name))
                throw new ToolException("InvalidInput", "'name' is required and must be non-empty.");

            var spriteToken = @params["sprite"];
            var colorArr = @params["color"] as JArray;
            var typeStr = @params.Value<string>("type");
            var layoutElementParams = @params["layoutElement"] as JObject;

            // Resolve sprite up front so failure leaves no orphan GO behind.
            Sprite sprite = ResolveSprite(spriteToken);
            Image.Type imageType = ParseImageType(typeStr);

            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent.transform, worldPositionStays: false);

            var rt = go.GetComponent<RectTransform>();
            // Default size matches Unity's "GameObject/UI/Image" menu shape.
            rt.sizeDelta = new Vector2(100, 100);
            // Responsive-by-default: an explicit anchorPreset overrides the fixed default rect.
            UiToolShared.ApplyOptionalAnchorPreset(rt, @params);

            var image = go.GetComponent<Image>();
            if (sprite != null) image.sprite = sprite;
            var parsedColor = UiToolShared.ParseColor(colorArr);
            if (parsedColor.HasValue) image.color = parsedColor.Value;
            image.type = imageType;

            int? layoutElementInstanceId = null;
            if (layoutElementParams != null)
            {
                var le = go.AddComponent<LayoutElement>();
                UiToolShared.ApplyLayoutElementParams(le, layoutElementParams);
                layoutElementInstanceId = le.GetInstanceID();
            }

            Undo.RegisterCreatedObjectUndo(go, $"ui_create_image({name})");

            var result = new JObject
            {
                ["instanceId"] = go.GetInstanceID(),
                ["rectTransformInstanceId"] = rt.GetInstanceID(),
                ["imageInstanceId"] = image.GetInstanceID(),
            };
            if (layoutElementInstanceId.HasValue)
                result["layoutElementInstanceId"] = layoutElementInstanceId.Value;
            return Task.FromResult(ToolResult.Json(result));
        }

        private static Sprite ResolveSprite(JToken spriteToken)
        {
            if (spriteToken == null || spriteToken.Type == JTokenType.Null) return null;
            if (spriteToken.Type == JTokenType.Integer)
            {
                var obj = EditorUtility.InstanceIDToObject(spriteToken.Value<int>()) as Sprite;
                if (obj == null)
                    throw new ToolException("InvalidInput",
                        $"'sprite' instanceId {spriteToken.Value<int>()} did not resolve to a Sprite.");
                return obj;
            }
            if (spriteToken.Type == JTokenType.String)
            {
                var path = spriteToken.Value<string>();
                var asset = AssetDatabase.LoadAssetAtPath<Sprite>(path);
                if (asset == null)
                    throw new ToolException("InvalidInput",
                        $"'sprite' asset path '{path}' did not load as a Sprite.");
                return asset;
            }
            throw new ToolException("InvalidInput",
                "'sprite' must be an integer (instanceId), a string (asset path), or null.");
        }

        private static Image.Type ParseImageType(string s)
        {
            if (string.IsNullOrEmpty(s)) return Image.Type.Simple;
            switch (s)
            {
                case "simple": return Image.Type.Simple;
                case "sliced": return Image.Type.Sliced;
                case "tiled": return Image.Type.Tiled;
                case "filled": return Image.Type.Filled;
                default:
                    throw new ToolException("InvalidInput",
                        $"'type' value '{s}' is not a valid Image.Type. Valid: simple, sliced, tiled, filled.");
            }
        }

    }
}
