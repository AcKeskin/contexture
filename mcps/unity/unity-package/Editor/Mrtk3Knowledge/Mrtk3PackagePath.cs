namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Package-relative path record. Used by every corpus field that points at
    /// a file shipped by a specific MRTK 3 package — sourceFile lives at the
    /// entry's top-level package, but canvasVariants and prefabs live under
    /// other packages (uxcomponents.canvas vs uxcomponents.noncanvas, etc.),
    /// so the field carries its own (package, path) instead of inheriting.
    /// </summary>
    internal sealed class Mrtk3PackagePath
    {
        public string Package { get; set; }
        public string Path { get; set; }
    }
}
