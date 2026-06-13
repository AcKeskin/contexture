using UnityEngine;

namespace UnityMcp.Editor.Tools.Vision
{
    /// <summary>
    /// Shared camera→PNG path used by view_game, view_scene_from, view_scene_orbit. Renders
    /// through a temporary RenderTexture rather than the Game View, so resolution is
    /// deterministic and edit-mode capture works without touching Editor windows.
    /// </summary>
    internal static class CameraCapture
    {
        public static byte[] RenderCameraToPng(Camera camera, int width, int height)
        {
            // 24-bit depth so opaque + transparent geometry both rasterize sanely.
            var rt = RenderTexture.GetTemporary(width, height, 24, RenderTextureFormat.ARGB32);
            var prevTarget = camera.targetTexture;
            var prevActive = RenderTexture.active;

            Texture2D readback = null;
            try
            {
                camera.targetTexture = rt;
                camera.Render();

                RenderTexture.active = rt;
                readback = new Texture2D(width, height, TextureFormat.RGB24, mipChain: false);
                readback.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                readback.Apply();

                return readback.EncodeToPNG();
            }
            finally
            {
                camera.targetTexture = prevTarget;
                RenderTexture.active = prevActive;
                RenderTexture.ReleaseTemporary(rt);
                if (readback != null) Object.DestroyImmediate(readback);
            }
        }

        public static Camera ResolveMainCamera()
        {
            var main = Camera.main;
            if (main != null && main.isActiveAndEnabled) return main;
            foreach (var c in Camera.allCameras)
            {
                if (c != null && c.isActiveAndEnabled) return c;
            }
            return null;
        }
    }
}
