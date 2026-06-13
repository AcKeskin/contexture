using System;
using System.IO;
using UnityEditor.PackageManager;
using UnityEngine;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace UnityMcp.Editor.Tools.Scripts
{
    /// <summary>
    /// Path policy shared by manage_script / find_in_file / script_apply_edits.
    /// Reads are broad (any in-project path); writes are narrow (Assets/ and the
    /// unity-mcp package itself only). Out-of-project paths always reject —
    /// this MCP is for editing the connected project, not arbitrary disk.
    /// </summary>
    internal static class ScriptPathPolicy
    {
        // Package roots writes are allowed under (in addition to Assets/). The
        // unity-mcp package itself is fair game — agents that work on the MCP
        // package live in the same Editor session as the package they're editing.
        private static readonly string[] _writableExtraPackageNames =
        {
            "com.ackeskin.unity-mcp",
        };

        /// <summary>
        /// Validate the given Unity-project-relative path for read access.
        /// Returns the absolute on-disk path on success; throws ToolException on
        /// reject. The path must:
        /// - be relative (not absolute);
        /// - resolve to a file under Assets/ or Packages/;
        /// - not contain `..` segments that escape the project.
        /// </summary>
        public static string ResolveForRead(string path)
        {
            ValidateBasic(path);
            var (absolute, _) = ResolveInternal(path);
            return absolute;
        }

        /// <summary>
        /// Validate for write. Writes are restricted to Assets/ and a small
        /// allowlist of editable packages (the unity-mcp package). Reads against
        /// other Packages/* paths still work, but writes are rejected.
        /// </summary>
        public static string ResolveForWrite(string path)
        {
            ValidateBasic(path);
            var (absolute, segments) = ResolveInternal(path);
            if (segments.Length < 1)
                throw new ToolException("InvalidInput", $"Path '{path}' is empty after normalization.");

            var top = segments[0];
            if (string.Equals(top, "Assets", StringComparison.OrdinalIgnoreCase))
                return absolute;

            if (string.Equals(top, "Packages", StringComparison.OrdinalIgnoreCase))
            {
                if (segments.Length < 2)
                    throw new ToolException("InvalidInput",
                        $"Path '{path}' targets 'Packages/' root with no package name.");

                foreach (var name in _writableExtraPackageNames)
                {
                    if (string.Equals(segments[1], name, StringComparison.OrdinalIgnoreCase))
                        return absolute;
                }
                throw new ToolException("InvalidInput",
                    $"Writes under 'Packages/' are restricted; '{segments[1]}' is not in the writable allowlist " +
                    $"({string.Join(", ", _writableExtraPackageNames)}). Edits to UPM-installed packages should " +
                    "happen via package source upstream, not through this MCP.");
            }

            throw new ToolException("InvalidInput",
                $"Path '{path}' is outside Assets/ and the writable Packages/ allowlist.");
        }

        /// <summary>True when the relative path's last segment ends with one of
        /// the script-like extensions. Used by tools that should reject binary
        /// asset paths.</summary>
        public static bool IsScriptExtension(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            var ext = Path.GetExtension(path);
            return string.Equals(ext, ".cs", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".asmdef", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".asmref", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".uxml", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".uss", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".shader", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".cginc", StringComparison.OrdinalIgnoreCase)
                || string.Equals(ext, ".hlsl", StringComparison.OrdinalIgnoreCase);
        }

        private static void ValidateBasic(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                throw new ToolException("InvalidInput", "'path' is required and must be non-empty.");
            if (Path.IsPathRooted(path))
                throw new ToolException("InvalidInput",
                    $"Absolute paths are rejected; pass a project-relative path (e.g. 'Assets/Scripts/Foo.cs'). Got: '{path}'.");
        }

        private static (string absolute, string[] segments) ResolveInternal(string path)
        {
            var normalized = path.Replace('\\', '/').TrimStart('/');
            var segments = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var seg in segments)
            {
                if (seg == ".." || seg == ".")
                    throw new ToolException("InvalidInput",
                        $"Path '{path}' contains '..' or '.' segments; only forward-resolving project-relative paths are allowed.");
            }

            string absolute;
            // Application.dataPath ends with '/Assets'; the project root is its parent.
            var projectRoot = Path.GetDirectoryName(Application.dataPath);

            // Packages/<name>/... resolves through Unity's package manager, not
            // through project root — UPM-installed packages live in Library/PackageCache,
            // file:// packages live wherever the manifest points. Either way, the
            // logical 'Packages/<name>/...' path is what Unity exposes.
            if (segments.Length >= 2 && string.Equals(segments[0], "Packages", StringComparison.OrdinalIgnoreCase))
            {
                PackageInfo info = null;
                try { info = PackageInfo.FindForPackageName(segments[1]); }
                catch { /* fall through */ }
                if (info == null || string.IsNullOrEmpty(info.resolvedPath))
                    throw new ToolException("InvalidInput",
                        $"Package '{segments[1]}' is not resolvable in this project. Check Packages/manifest.json.");

                var rel = string.Join("/", segments, 2, segments.Length - 2);
                absolute = string.IsNullOrEmpty(rel)
                    ? Path.GetFullPath(info.resolvedPath)
                    : Path.GetFullPath(Path.Combine(info.resolvedPath, rel));
                // Defensive: confirm we didn't somehow escape the package root.
                var packageRoot = Path.GetFullPath(info.resolvedPath);
                if (!absolute.StartsWith(packageRoot, StringComparison.OrdinalIgnoreCase))
                    throw new ToolException("InvalidInput",
                        $"Path '{path}' resolves outside its package root.");
                return (absolute, segments);
            }

            // Assets/... and any other project-rooted path resolves under the project root.
            absolute = Path.GetFullPath(Path.Combine(projectRoot, normalized));
            if (!absolute.StartsWith(projectRoot, StringComparison.OrdinalIgnoreCase))
                throw new ToolException("InvalidInput",
                    $"Path '{path}' resolves outside the project root.");
            return (absolute, segments);
        }
    }
}
