using System;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEditor.PackageManager;
using UnityEngine;

namespace UnityMcp.Editor
{
    /// <summary>
    /// Reads the package's <c>package.json</c> for unity-mcp config (the
    /// <c>"unityMcp"</c> top-level block). Cached after first successful read;
    /// a domain reload forces a fresh read. Editing <c>package.json</c> is
    /// the single source of truth — see config-is-truth rule.
    /// </summary>
    internal static class PackageConfig
    {
        private const string PackageName = "com.ackeskin.unity-mcp";
        private static bool _read;
        private static bool _customToolsEnabled;

        /// <summary>True when the package's package.json sets
        /// <c>unityMcp.customToolsEnabled = true</c>. False (default) when the
        /// flag is absent, set to false, or the config can't be read.</summary>
        public static bool CustomToolsEnabled
        {
            get
            {
                EnsureRead();
                return _customToolsEnabled;
            }
        }

        private static void EnsureRead()
        {
            if (_read) return;
            _read = true;
            try
            {
                var path = ResolvePackageJsonPath();
                if (path == null || !File.Exists(path))
                {
                    Debug.LogWarning($"[UnityMCP] package.json not found for {PackageName}; treating customToolsEnabled as false.");
                    return;
                }
                var raw = File.ReadAllText(path);
                var json = JObject.Parse(raw);
                var block = json["unityMcp"] as JObject;
                if (block == null) return;
                _customToolsEnabled = block.Value<bool?>("customToolsEnabled") ?? false;
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[UnityMCP] failed to read package.json: {ex.Message}");
            }
        }

        private static string ResolvePackageJsonPath()
        {
            // Preferred path: PackageManager registry (works for embedded + UPM-installed packages).
            try
            {
                var info = PackageInfo.FindForPackageName(PackageName);
                if (info != null && !string.IsNullOrEmpty(info.resolvedPath))
                {
                    return Path.Combine(info.resolvedPath, "package.json");
                }
            }
            catch { /* fall through */ }

            // Fallback: assembly location → walk up to find package.json. Useful when
            // the registry hasn't initialized yet (rare; mostly during very-early boot).
            var asmPath = typeof(PackageConfig).Assembly.Location;
            var dir = Path.GetDirectoryName(asmPath);
            for (int i = 0; i < 6 && dir != null; i++)
            {
                var candidate = Path.Combine(dir, "package.json");
                if (File.Exists(candidate)) return candidate;
                dir = Path.GetDirectoryName(dir);
            }
            return null;
        }
    }
}
