using System;
using System.Collections.Generic;
using System.Threading;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityMcp.Editor.Capabilities
{
    /// <summary>
    /// Detects installed packages, render pipeline, and XR subsystems and folds
    /// them into a <see cref="CapabilitySet"/>. Results are cached for
    /// <see cref="CacheTtlSeconds"/> seconds — the descriptor build path queries
    /// often, but the underlying state changes rarely (package install, RP swap).
    /// </summary>
    internal static class CapabilityDetector
    {
        private const double CacheTtlSeconds = 5.0;
        private const int PackageListWaitMs = 1500;

        private const string XriPackageName = "com.unity.xr.interaction.toolkit";
        private const string MrtkPackageName = "com.microsoft.mrtk.uxcomponents";
        private const string XrHandsPackageName = "com.unity.xr.hands";
        private const string OpenXrEyeGazeMarker = "com.unity.xr.openxr"; // proxy for eye-gaze interaction profile availability
        private const string UguiPackageName = "com.unity.ugui"; // gates the UGUI authoring tools (Canvas/Image/Text/Button)

        private static CapabilitySet _cached;
        private static DateTime _cachedAtUtc;
        private static readonly object _lock = new object();

        public static CapabilitySet Detect()
        {
            lock (_lock)
            {
                if (_cached != null && (DateTime.UtcNow - _cachedAtUtc).TotalSeconds < CacheTtlSeconds)
                {
                    return _cached;
                }

                var keys = new HashSet<CapabilityKey>();
                string xriVersion = null;
                string mrtkVersion = null;
                var packageStrings = new List<string>();

                // Render pipeline.
                var rp = GraphicsSettings.currentRenderPipeline;
                if (rp == null)
                {
                    keys.Add(CapabilityKey.Builtin);
                }
                else
                {
                    var typeName = rp.GetType().Name;
                    if (typeName.Contains("Universal")) keys.Add(CapabilityKey.Urp);
                    else if (typeName.Contains("HDRender") || typeName.Contains("HDRP")) keys.Add(CapabilityKey.Hdrp);
                    else keys.Add(CapabilityKey.Builtin);
                }

                // Package detection. Best-effort — bounded wait, never blocks the editor longer than PackageListWaitMs.
                try
                {
                    var listRequest = Client.List(offlineMode: true, includeIndirectDependencies: true);
                    var t0 = DateTime.UtcNow;
                    while (!listRequest.IsCompleted && (DateTime.UtcNow - t0).TotalMilliseconds < PackageListWaitMs)
                    {
                        Thread.Sleep(20);
                    }
                    if (listRequest.IsCompleted && listRequest.Status == StatusCode.Success && listRequest.Result != null)
                    {
                        foreach (var pkg in listRequest.Result)
                        {
                            var name = pkg.name ?? string.Empty;
                            if (name == XriPackageName) { keys.Add(CapabilityKey.Xri); xriVersion = pkg.version; }
                            else if (name == MrtkPackageName) { keys.Add(CapabilityKey.Mrtk); mrtkVersion = pkg.version; }
                            else if (name == XrHandsPackageName) keys.Add(CapabilityKey.XriHands);
                            else if (name == OpenXrEyeGazeMarker) keys.Add(CapabilityKey.XriEyeGaze);
                            else if (name == UguiPackageName) keys.Add(CapabilityKey.Ugui);
                            else if (name == "com.unity.test-framework") keys.Add(CapabilityKey.TestFramework);

                            // Preserve v1 packages[] surface: test-framework, render-pipelines.*, xr.*.
                            if (name.StartsWith("com.unity.test-framework") ||
                                name.StartsWith("com.unity.render-pipelines.") ||
                                name.StartsWith("com.unity.xr."))
                            {
                                packageStrings.Add($"{name}@{pkg.version}");
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityMCP] capability package detection failed: {ex.Message}");
                }

                // Subsystem keys (xri.hands, xri.eyeGaze) only meaningful when XRI itself is present.
                if (!keys.Contains(CapabilityKey.Xri))
                {
                    keys.Remove(CapabilityKey.XriHands);
                    keys.Remove(CapabilityKey.XriEyeGaze);
                }

                // MRTK 3 fallback: dev-template setups embed MRTK 3 source rather than installing
                // the com.microsoft.mrtk.uxcomponents UPM package. Probe loaded assemblies for the
                // sentinel MRTK UX type when the package wasn't found.
                if (!keys.Contains(CapabilityKey.Mrtk) && IsMrtk3AssemblyLoaded())
                {
                    keys.Add(CapabilityKey.Mrtk);
                    mrtkVersion = "embedded";
                }

                _cached = new CapabilitySet(keys, xriVersion, mrtkVersion, packageStrings);
                _cachedAtUtc = DateTime.UtcNow;
                return _cached;
            }
        }

        private static bool IsMrtk3AssemblyLoaded()
        {
            // Sentinel types — present in any MRTK 3 install (UPM or embedded source).
            // Microsoft-published builds use "Microsoft.MixedReality.Toolkit.*" assemblies;
            // dev-template / forked-source builds use "MixedReality.Toolkit.*" (no Microsoft. prefix).
            // Probe both, with PressableButton as the load-bearing UX sentinel.
            string[] sentinels =
            {
                "Microsoft.MixedReality.Toolkit.UX.PressableButton, Microsoft.MixedReality.Toolkit.UX",
                "MixedReality.Toolkit.UX.PressableButton, MixedReality.Toolkit.UX",
                "Microsoft.MixedReality.Toolkit.MRTKBaseInteractable, Microsoft.MixedReality.Toolkit",
                "MixedReality.Toolkit.MRTKBaseInteractable, MixedReality.Toolkit",
            };
            foreach (var typeName in sentinels)
            {
                if (Type.GetType(typeName, throwOnError: false) != null) return true;
            }
            // Fallback: any loaded assembly whose name matches either MRTK prefix.
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (asm.IsDynamic) continue;
                var name = asm.GetName().Name ?? string.Empty;
                if (name.StartsWith("Microsoft.MixedReality.Toolkit", StringComparison.Ordinal) ||
                    name.StartsWith("MixedReality.Toolkit", StringComparison.Ordinal))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
