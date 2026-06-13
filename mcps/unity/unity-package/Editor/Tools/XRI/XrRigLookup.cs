#if UNITY_MCP_HAS_XRI
using System;
using System.Linq;
using Unity.XR.CoreUtils;
using UnityEngine;
using UnityEngine.SceneManagement;
#endif

namespace UnityMcp.Editor.Tools.XRI
{
    /// <summary>
    /// Shared XR rig lookup. Walks loaded scenes to find the active XROrigin and
    /// to match hand transforms by name fragment. Centralises a heuristic that
    /// previously lived duplicated across xri_*, view_xr_simulator, and
    /// view_user_perspective.
    /// </summary>
    internal static class XrRigLookup
    {
#if UNITY_MCP_HAS_XRI
        public static XROrigin FindActive()
        {
            int sceneCount = SceneManager.sceneCount;
            for (int i = 0; i < sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (!scene.isLoaded) continue;
                foreach (var root in scene.GetRootGameObjects())
                {
                    var origin = root.GetComponentInChildren<XROrigin>(true);
                    if (origin != null) return origin;
                }
            }
            return null;
        }

        /// <summary>Best-effort hand transform lookup by name fragment.
        /// Matches "*<match>Hand*" or "*<match>Controller*"; returns null when
        /// nothing matches. Used by xri_simulate_pose (read+write) and
        /// view_user_perspective for the sidecar pose snapshots.</summary>
        public static Transform FindHandTransform(XROrigin origin, string match)
        {
            if (origin == null || string.IsNullOrEmpty(match)) return null;
            var transforms = origin.GetComponentsInChildren<Transform>(true);
            return transforms.FirstOrDefault(t =>
                (t.name.IndexOf(match + "Hand", StringComparison.OrdinalIgnoreCase) >= 0) ||
                (t.name.IndexOf(match + "Controller", StringComparison.OrdinalIgnoreCase) >= 0));
        }
#endif
    }
}
