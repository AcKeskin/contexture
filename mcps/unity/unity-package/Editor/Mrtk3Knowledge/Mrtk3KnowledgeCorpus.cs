using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// In-memory snapshot of the corpus — every <c>*.yaml</c> directly under
    /// the package's <c>Editor/Mrtk3Knowledge/</c> folder (Fixtures/ excluded).
    /// Component / decision-rule files become <see cref="Entries"/> indexed by
    /// id and short name; <c>prefabs.yaml</c> populates <see cref="Prefabs"/>.
    ///
    /// Built lazily — call <see cref="Get"/>. The static cache is reset on
    /// every domain reload (the Lazy initializer fires when the assembly
    /// reloads), so corpus edits propagate without a manual reload step.
    ///
    /// Per-file load failures emit one terse <c>Debug.LogWarning</c> per
    /// offending file, then exclude that file. The total error count is
    /// surfaced via <see cref="ErrorCount"/> so tool envelopes can include
    /// <c>corpusErrors</c> when non-zero.
    /// </summary>
    internal sealed class Mrtk3KnowledgeCorpus
    {
        private const string PackageName = "com.ackeskin.unity-mcp";
        private const string PrefabCatalogFileName = "prefabs.yaml";

        private static Lazy<Mrtk3KnowledgeCorpus> _cache = new Lazy<Mrtk3KnowledgeCorpus>(Load);

        public static Mrtk3KnowledgeCorpus Get() => _cache.Value;

        /// <summary>For tests / dev tooling. Drops the cached snapshot so the
        /// next <see cref="Get"/> rebuilds from disk without a domain reload.</summary>
        public static void Invalidate() => _cache = new Lazy<Mrtk3KnowledgeCorpus>(Load);

        public IReadOnlyDictionary<string, Mrtk3KnowledgeEntry> ById { get; }
        public IReadOnlyDictionary<string, Mrtk3KnowledgeEntry> ByName { get; }
        public IReadOnlyList<Mrtk3PrefabCatalogEntry> Prefabs { get; }
        public int ErrorCount { get; }

        private Mrtk3KnowledgeCorpus(
            Dictionary<string, Mrtk3KnowledgeEntry> byId,
            Dictionary<string, Mrtk3KnowledgeEntry> byName,
            List<Mrtk3PrefabCatalogEntry> prefabs,
            int errorCount)
        {
            ById = byId;
            ByName = byName;
            Prefabs = prefabs;
            ErrorCount = errorCount;
        }

        public Mrtk3KnowledgeEntry GetByName(string shortName)
        {
            if (string.IsNullOrEmpty(shortName)) return null;
            return ByName.TryGetValue(shortName, out var e) ? e : null;
        }

        public Mrtk3KnowledgeEntry GetById(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            return ById.TryGetValue(id, out var e) ? e : null;
        }

        private static Mrtk3KnowledgeCorpus Load()
        {
            var corpusDir = ResolveCorpusDir();
            if (corpusDir == null)
            {
                return new Mrtk3KnowledgeCorpus(
                    new Dictionary<string, Mrtk3KnowledgeEntry>(),
                    new Dictionary<string, Mrtk3KnowledgeEntry>(),
                    new List<Mrtk3PrefabCatalogEntry>(),
                    errorCount: 0);
            }

            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .IgnoreUnmatchedProperties()
                .Build();

            var rawEntries = new Dictionary<string, (Mrtk3KnowledgeEntry entry, string source)>();
            var prefabs = new List<Mrtk3PrefabCatalogEntry>();
            int errors = 0;

            foreach (var path in Directory.GetFiles(corpusDir, "*.yaml"))
            {
                var fileName = Path.GetFileName(path);
                if (string.Equals(fileName, PrefabCatalogFileName, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        var catalog = deserializer.Deserialize<Mrtk3PrefabCatalog>(File.ReadAllText(path));
                        if (catalog?.Prefabs != null) prefabs.AddRange(catalog.Prefabs);
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[UnityMCP] mrtk3 corpus error in {fileName}: {ex.Message}");
                        errors++;
                    }
                    continue;
                }

                Mrtk3KnowledgeEntry entry;
                try { entry = deserializer.Deserialize<Mrtk3KnowledgeEntry>(File.ReadAllText(path)); }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[UnityMCP] mrtk3 corpus error in {fileName}: {ex.Message}");
                    errors++;
                    continue;
                }
                if (entry?.Id == null)
                {
                    Debug.LogWarning($"[UnityMCP] mrtk3 corpus error in {fileName}: entry missing 'id'.");
                    errors++;
                    continue;
                }
                if (rawEntries.ContainsKey(entry.Id))
                {
                    Debug.LogWarning($"[UnityMCP] mrtk3 corpus error in {fileName}: duplicate id '{entry.Id}' (already declared in {rawEntries[entry.Id].source}).");
                    errors++;
                    continue;
                }
                rawEntries[entry.Id] = (entry, fileName);
            }

            // Validation pass — build id index from raw entries, run validator.
            var idIndex = rawEntries.ToDictionary(p => p.Key, p => p.Value.entry);
            var byId = new Dictionary<string, Mrtk3KnowledgeEntry>();
            var byName = new Dictionary<string, Mrtk3KnowledgeEntry>();
            foreach (var (entry, source) in rawEntries.Values)
            {
                var entryErrors = Mrtk3KnowledgeValidator.Validate(entry, source, idIndex);
                if (entryErrors.Count > 0)
                {
                    Debug.LogWarning($"[UnityMCP] mrtk3 corpus error in {source}: {string.Join("; ", entryErrors)}");
                    errors++;
                    continue;
                }
                byId[entry.Id] = entry;
                if (!string.IsNullOrEmpty(entry.Name) && !byName.ContainsKey(entry.Name))
                    byName[entry.Name] = entry;
            }

            return new Mrtk3KnowledgeCorpus(byId, byName, prefabs, errors);
        }

        private static string ResolveCorpusDir()
        {
            try
            {
                var info = PackageInfo.FindForPackageName(PackageName);
                if (info != null && !string.IsNullOrEmpty(info.resolvedPath))
                {
                    var dir = Path.Combine(info.resolvedPath, "Editor", "Mrtk3Knowledge");
                    if (Directory.Exists(dir)) return dir;
                }
            }
            catch { /* fall through */ }
            Debug.LogWarning("[UnityMCP] mrtk3 corpus directory not found — corpus will be empty.");
            return null;
        }
    }
}
