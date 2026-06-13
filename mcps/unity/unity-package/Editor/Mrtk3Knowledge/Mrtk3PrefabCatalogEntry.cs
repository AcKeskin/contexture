using System.Collections.Generic;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// One row from prefabs.yaml. <see cref="Package"/> + <see cref="Path"/>
    /// is package-relative — the tool does not pre-resolve to an absolute
    /// path. SizeMm is the physical size in millimetres (Non-Canvas buttons
    /// primarily); null for prefabs without a fixed size variant such as
    /// hand menus or dialogs. VariantOf points at the base prefab when this
    /// entry is a stylistic variant.
    /// </summary>
    internal sealed class Mrtk3PrefabCatalogEntry
    {
        public string Name { get; set; }
        public string Package { get; set; }
        public string Path { get; set; }
        public string Category { get; set; }
        public string Canvas { get; set; }
        public List<int> SizeMm { get; set; }
        public string VariantOf { get; set; }
    }

    /// <summary>
    /// Top-level shape of prefabs.yaml. <see cref="Kind"/> is always
    /// "prefab-catalog"; the loader uses it to route this file into the
    /// prefab collection rather than the entry indices.
    /// </summary>
    internal sealed class Mrtk3PrefabCatalog
    {
        public int SchemaVersion { get; set; }
        public string Kind { get; set; }
        public List<Mrtk3PrefabCatalogEntry> Prefabs { get; set; } = new();
    }
}
