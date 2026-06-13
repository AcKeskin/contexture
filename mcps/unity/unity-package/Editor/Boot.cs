using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Bridge;
using UnityMcp.Editor.Console;
using UnityMcp.Editor.Discovery;
using UnityMcp.Editor.Tools;

namespace UnityMcp.Editor
{
    // v2 slice 4 review: imports tightened, regex tightened, comments synced with code.
    [InitializeOnLoad]
    internal static class Boot
    {
        private static bool _booted;

        static Boot()
        {
            EditorApplication.delayCall += Initialize;
        }

        private static void Initialize()
        {
            if (_booted) return;
            _booted = true;

            try
            {
                ConsoleLogBuffer.Initialize();
                ToolRegistry.Initialize();
                MainThreadDispatcher.Initialize();

                int preferredPort = ReloadHandler.TryGetLastPort(out var p) ? p : 0;
                HttpHost.Start(preferredPort, out var port);
                if (preferredPort > 0 && port != preferredPort)
                {
                    Debug.Log($"[UnityMCP] previous port {preferredPort} unavailable; rebound on {port}.");
                }

                RegistryWriter.Write(port);
                EditorApplication.quitting += OnQuitting;
                AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
                Debug.Log($"[UnityMCP] boot complete on port {port}, {ToolRegistry.All().Count} tools registered (customTools={PackageConfig.CustomToolsEnabled}).");
            }
            catch (System.Exception ex)
            {
                Debug.LogError($"[UnityMCP] boot failed: {ex.Message}\n{ex.StackTrace}");
            }
        }

        private static void OnQuitting()
        {
            ReloadHandler.ClearLastPort();
            Shutdown();
        }

        private static void OnBeforeAssemblyReload()
        {
            // Persist the bound port so the post-reload Boot can rebind on it.
            // ReloadHandler.OnBeforeReload also tears down the listener + registry entry.
            ReloadHandler.OnBeforeReload(HttpHost.Port);
            _booted = false;
        }

        private static void Shutdown()
        {
            try { RegistryWriter.Delete(); } catch { }
            try { HttpHost.Stop(); } catch { }
            try { MainThreadDispatcher.Shutdown(); } catch { }
            try { ConsoleLogBuffer.Shutdown(); } catch { }
            _booted = false;
        }
    }
}
