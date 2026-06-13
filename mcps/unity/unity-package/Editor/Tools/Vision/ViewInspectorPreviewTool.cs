using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// Returns Unity's built-in Inspector preview thumbnail for an asset (Material, Mesh,
    /// Texture2D, Sprite, AudioClip, Shader, etc.). Tries AssetPreview first (matches the
    /// Inspector preview pane) and falls back to GetMiniThumbnail. Errors with InvalidInput
    /// when the asset path doesn't resolve.
    /// </summary>
    [UnityMcpTool("view_inspector_preview")]
    internal sealed class ViewInspectorPreviewTool : IUnityMcpTool
    {
        private const int PreviewWaitMs = 1500;

        public string Name => "view_inspector_preview";

        public string Description =>
            "Return Unity's built-in Inspector preview thumbnail for an asset path " +
            "(Material, Mesh, Texture2D, Sprite, AudioClip waveform, Shader icon). " +
            "Returns one PNG content block. Errors when path doesn't resolve. " +
            "Prefabs are NOT supported — instantiate them and capture via view_scene_from instead.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["path"] = new JObject { ["type"] = "string" },
            },
            ["required"] = new JArray { "path" },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            string path = @params.Value<string>("path");
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("'path' is required.");
            }

            var asset = AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);
            if (asset == null)
            {
                throw new ArgumentException($"No asset at '{path}'.");
            }

            if (asset is GameObject && path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    "Prefab previews are not supported by view_inspector_preview. " +
                    "Instantiate via prefab_instantiate and capture the scene with view_scene_from instead.");
            }

            // AssetPreview is async — the first call may return null while Unity generates it.
            // Bounded wait, then fall back to mini thumbnail (always synchronous).
            Texture2D tex = AssetPreview.GetAssetPreview(asset);
            var t0 = DateTime.UtcNow;
            while (tex == null
                   && AssetPreview.IsLoadingAssetPreview(asset.GetInstanceID())
                   && (DateTime.UtcNow - t0).TotalMilliseconds < PreviewWaitMs)
            {
                System.Threading.Thread.Sleep(50);
                tex = AssetPreview.GetAssetPreview(asset);
            }
            if (tex == null)
            {
                tex = AssetPreview.GetMiniThumbnail(asset);
            }
            if (tex == null)
            {
                throw new InvalidOperationException(
                    $"Unable to obtain a preview for '{path}' ({asset.GetType().Name}). Asset type may not have a preview.");
            }

            // The texture may not be readable directly; render through a temp RenderTexture.
            byte[] png = TextureToPng(tex);
            return Task.FromResult(ToolResult.Png(png));
        }

        private static byte[] TextureToPng(Texture2D source)
        {
            int w = source.width, h = source.height;
            var rt = RenderTexture.GetTemporary(w, h, 0, RenderTextureFormat.ARGB32);
            var prev = RenderTexture.active;
            Texture2D readback = null;
            try
            {
                Graphics.Blit(source, rt);
                RenderTexture.active = rt;
                readback = new Texture2D(w, h, TextureFormat.RGBA32, mipChain: false);
                readback.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                readback.Apply();
                return readback.EncodeToPNG();
            }
            finally
            {
                RenderTexture.active = prev;
                RenderTexture.ReleaseTemporary(rt);
                if (readback != null) UnityEngine.Object.DestroyImmediate(readback);
            }
        }
    }
}
