using System.IO;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Tri-state package-relative path resolution. Used by the corpus
    /// validator and by the describe / list-prefabs tools — both need to ask
    /// "does this (package, path) resolve, and if not, why not?"
    ///
    /// The crucial distinction is <see cref="Status.PackageMissing"/> vs
    /// <see cref="Status.PathMissing"/>. PackageMissing is a soft skip — the
    /// user simply doesn't have that MRTK package installed in this project.
    /// PathMissing is a real error — the package IS installed but the path
    /// inside it doesn't exist (corpus drift). The validator surfaces only
    /// PathMissing as an error; tools surface PackageMissing via the
    /// `packageInstalled` envelope flag.
    /// </summary>
    internal static class Mrtk3PathResolver
    {
        public enum Status
        {
            PackageMissing,
            PathMissing,
            Resolved,
        }

        public static (Status status, string absolutePath) Resolve(string packageName, string relativePath)
        {
            if (string.IsNullOrEmpty(packageName))
                return (Status.PackageMissing, null);

            PackageInfo info;
            try { info = PackageInfo.FindForPackageName(packageName); }
            catch { info = null; }

            if (info == null || string.IsNullOrEmpty(info.resolvedPath))
                return (Status.PackageMissing, null);

            if (string.IsNullOrEmpty(relativePath))
                return (Status.PathMissing, null);

            var combined = Path.Combine(info.resolvedPath, relativePath);
            return File.Exists(combined)
                ? (Status.Resolved, combined)
                : (Status.PathMissing, null);
        }

        public static bool IsPackageInstalled(string packageName)
        {
            if (string.IsNullOrEmpty(packageName)) return false;
            try
            {
                var info = PackageInfo.FindForPackageName(packageName);
                return info != null && !string.IsNullOrEmpty(info.resolvedPath);
            }
            catch { return false; }
        }
    }
}
