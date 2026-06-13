using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityMcp.Editor.Discovery;

namespace UnityMcp.Editor.Bridge
{
    /// <summary>
    /// Survives Unity script recompiles without user intervention. On
    /// `beforeAssemblyReload`, snapshots the bound port to project-scoped EditorPrefs
    /// and shuts the listener down cleanly. After reload, [InitializeOnLoad] re-fires
    /// Boot, which calls <see cref="TryGetLastPort"/> to attempt rebind on the same port.
    /// </summary>
    internal static class ReloadHandler
    {
        private const string PortKeySuffix = ".LastPort";

        private static string _projectKeyPrefix;

        public static void OnBeforeReload(int boundPort)
        {
            try
            {
                EditorPrefs.SetInt(GetKey(PortKeySuffix), boundPort);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityMCP] failed to persist reload state: {ex.Message}");
            }

            try { RegistryWriter.Delete(); } catch { }
            try { HttpHost.Stop(); } catch { }
            try { MainThreadDispatcher.Shutdown(); } catch { }
        }

        public static bool TryGetLastPort(out int port)
        {
            port = 0;
            try
            {
                var key = GetKey(PortKeySuffix);
                if (!EditorPrefs.HasKey(key)) return false;
                port = EditorPrefs.GetInt(key, 0);
                return port > 0;
            }
            catch
            {
                return false;
            }
        }

        public static void ClearLastPort()
        {
            try { EditorPrefs.DeleteKey(GetKey(PortKeySuffix)); } catch { }
        }

        private static string GetKey(string suffix)
        {
            if (_projectKeyPrefix == null)
            {
                var projectPath = Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath;
                _projectKeyPrefix = "UnityMCP." + ShortHash(projectPath);
            }
            return _projectKeyPrefix + suffix;
        }

        private static string ShortHash(string input)
        {
            using (var sha = SHA1.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input ?? string.Empty));
                var sb = new StringBuilder(8);
                for (int i = 0; i < 4; i++) sb.Append(bytes[i].ToString("x2"));
                return sb.ToString();
            }
        }
    }
}
