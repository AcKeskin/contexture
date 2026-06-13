using System;
using System.Collections.Generic;

namespace UnityMcp.Editor.Capabilities
{
    /// <summary>
    /// Immutable bundle of capability keys live in the running Editor.
    /// Built once per <see cref="CapabilityDetector.Detect"/> call.
    /// </summary>
    internal sealed class CapabilitySet
    {
        private readonly HashSet<CapabilityKey> _keys;
        private readonly string _xriVersion;
        private readonly string _mrtkVersion;
        private readonly IReadOnlyList<string> _packageStrings;

        public CapabilitySet(
            HashSet<CapabilityKey> keys,
            string xriVersion,
            string mrtkVersion,
            IReadOnlyList<string> packageStrings)
        {
            _keys = keys ?? new HashSet<CapabilityKey>();
            _xriVersion = xriVersion;
            _mrtkVersion = mrtkVersion;
            _packageStrings = packageStrings ?? Array.Empty<string>();
        }

        public bool Has(CapabilityKey key) => _keys.Contains(key);

        public string XriVersion => _xriVersion;
        public string MrtkVersion => _mrtkVersion;
        public IReadOnlyList<string> PackageStrings => _packageStrings;

        public IEnumerable<string> ToWireStrings()
        {
            foreach (var k in _keys) yield return k.ToWireString();
        }
    }
}
