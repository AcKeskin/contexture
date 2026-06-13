using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Manual validator harness — exposes <see cref="MenuItem"/>s that load
    /// the fixtures under Editor/Mrtk3Knowledge/Fixtures/ and prints validator
    /// output to the Console. Not used by the runtime tool path (the loader
    /// in a later step calls <see cref="Mrtk3KnowledgeValidator.Validate"/>
    /// directly against the live corpus). Lives in this file so corpus
    /// authors have a one-click round-trip while editing YAML.
    /// </summary>
    internal static class Mrtk3KnowledgeValidatorTests
    {
        private const string PackageName = "com.ackeskin.unity-mcp";
        private const string SentinelFileName = ".validator-runonce";
        private const string CorpusSentinelFileName = ".corpus-runonce";

        /// <summary>
        /// Auto-run sentinel: if a file named <see cref="SentinelFileName"/> exists in
        /// Editor/Mrtk3Knowledge/Fixtures/, run validation on assembly reload and
        /// delete the sentinel. Lets remote callers (no menu access) trigger one
        /// validation pass by touching the sentinel.
        ///
        /// Sibling sentinel <see cref="CorpusSentinelFileName"/> in the same directory
        /// triggers <see cref="RunCorpusValidation"/> against the live top-level
        /// corpus files (Editor/Mrtk3Knowledge/*.yaml, Fixtures excluded). Used by
        /// the authoring loop to validate all 16 corpus files in one round-trip
        /// instead of copy/move-per-file shuffling.
        /// </summary>
        [InitializeOnLoadMethod]
        private static void MaybeRunOnReload()
        {
            try
            {
                var fixtureDir = ResolveFixtureDirSilent();
                if (fixtureDir == null) return;

                var fixtureSentinel = Path.Combine(fixtureDir, SentinelFileName);
                var corpusSentinel = Path.Combine(fixtureDir, CorpusSentinelFileName);

                if (File.Exists(fixtureSentinel))
                {
                    File.Delete(fixtureSentinel);
                    EditorApplication.delayCall += () => { RunFixtureValidation(); ProbePathResolver(); };
                }
                if (File.Exists(corpusSentinel))
                {
                    File.Delete(corpusSentinel);
                    EditorApplication.delayCall += RunCorpusValidation;
                }
            }
            catch { /* best-effort */ }
        }

        [MenuItem("Tools/UnityMCP/Validate Mrtk3 Knowledge Fixtures")]
        public static void RunFixtureValidation()
        {
            var fixtureDir = ResolveFixtureDir();
            if (fixtureDir == null) return;

            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .IgnoreUnmatchedProperties()
                .Build();

            // First pass — deserialize all fixtures and build the id index used by
            // the relatedRules-resolution check. The dangling-related-rule fixture
            // references an id that doesn't exist anywhere, so it should still fail.
            var entries = new Dictionary<string, (Mrtk3KnowledgeEntry entry, string source)>();
            foreach (var path in Directory.GetFiles(fixtureDir, "*.yaml"))
            {
                Mrtk3KnowledgeEntry e;
                try { e = deserializer.Deserialize<Mrtk3KnowledgeEntry>(File.ReadAllText(path)); }
                catch (System.Exception ex)
                {
                    Debug.LogError($"[UnityMCP] {Path.GetFileName(path)}: deserialize failed — {ex.Message}");
                    continue;
                }
                if (e?.Id != null && !entries.ContainsKey(e.Id))
                    entries[e.Id] = (e, Path.GetFileName(path));
            }

            var idIndex = entries.ToDictionary(p => p.Key, p => p.Value.entry);

            int passing = 0;
            foreach (var (entry, source) in entries.Values)
            {
                var errors = Mrtk3KnowledgeValidator.Validate(entry, source, idIndex);
                if (errors.Count == 0)
                {
                    Debug.Log($"[UnityMCP] {source}: 0 errors.");
                    passing++;
                }
                else
                {
                    Debug.LogWarning($"[UnityMCP] {source}: {errors.Count} error(s):\n  - " + string.Join("\n  - ", errors));
                }
            }

            Debug.Log($"[UnityMCP] Fixture validation complete: {passing}/{entries.Count} fixtures passed.");
        }

        /// <summary>
        /// Validates the live corpus — every YAML file directly under
        /// Editor/Mrtk3Knowledge/ (top-level only, excluding the Fixtures/
        /// negative-test subfolder and the prefab catalog file). Used by the
        /// authoring loop to confirm zero errors across all 15 component +
        /// decision-rule files plus prefabs.yaml in a single round-trip.
        /// </summary>
        [MenuItem("Tools/UnityMCP/Validate Mrtk3 Knowledge Corpus")]
        public static void RunCorpusValidation()
        {
            var corpusDir = ResolveCorpusDir();
            if (corpusDir == null) return;

            var deserializer = new DeserializerBuilder()
                .WithNamingConvention(CamelCaseNamingConvention.Instance)
                .IgnoreUnmatchedProperties()
                .Build();

            // Two-pass: build id index from all entries first, then validate.
            // Routes prefabs.yaml separately — it's a Mrtk3PrefabCatalog, not a
            // single Mrtk3KnowledgeEntry, so the validator doesn't apply.
            var entries = new Dictionary<string, (Mrtk3KnowledgeEntry entry, string source)>();
            string prefabCatalogPath = null;
            foreach (var path in Directory.GetFiles(corpusDir, "*.yaml"))
            {
                var fileName = Path.GetFileName(path);
                if (string.Equals(fileName, "prefabs.yaml", System.StringComparison.OrdinalIgnoreCase))
                {
                    prefabCatalogPath = path;
                    continue;
                }

                Mrtk3KnowledgeEntry e;
                try { e = deserializer.Deserialize<Mrtk3KnowledgeEntry>(File.ReadAllText(path)); }
                catch (System.Exception ex)
                {
                    Debug.LogError($"[UnityMCP] {fileName}: deserialize failed — {ex.Message}");
                    continue;
                }
                if (e?.Id == null)
                {
                    Debug.LogWarning($"[UnityMCP] {fileName}: entry missing 'id' — cannot index for relatedRules check.");
                    continue;
                }
                if (entries.ContainsKey(e.Id))
                {
                    Debug.LogWarning($"[UnityMCP] {fileName}: duplicate id '{e.Id}' — already declared by {entries[e.Id].source}.");
                    continue;
                }
                entries[e.Id] = (e, fileName);
            }

            var idIndex = entries.ToDictionary(p => p.Key, p => p.Value.entry);

            int passing = 0;
            foreach (var (entry, source) in entries.Values)
            {
                var errors = Mrtk3KnowledgeValidator.Validate(entry, source, idIndex);
                if (errors.Count == 0)
                {
                    Debug.Log($"[UnityMCP] {source}: 0 errors.");
                    passing++;
                }
                else
                {
                    Debug.LogWarning($"[UnityMCP] {source}: {errors.Count} error(s):\n  - " + string.Join("\n  - ", errors));
                }
            }

            // Validate prefab catalog: load shape, count entries / categories,
            // resolve every (package, path) — PathMissing is an error,
            // PackageMissing soft-skips.
            int prefabCount = 0, categoryCount = 0, prefabPathErrors = 0;
            if (prefabCatalogPath != null)
            {
                var prefabFile = Path.GetFileName(prefabCatalogPath);
                Mrtk3PrefabCatalog catalog;
                try { catalog = deserializer.Deserialize<Mrtk3PrefabCatalog>(File.ReadAllText(prefabCatalogPath)); }
                catch (System.Exception ex)
                {
                    Debug.LogError($"[UnityMCP] {prefabFile}: deserialize failed — {ex.Message}");
                    catalog = null;
                }

                if (catalog != null)
                {
                    if (catalog.SchemaVersion != 1)
                        Debug.LogWarning($"[UnityMCP] {prefabFile}: schemaVersion is {catalog.SchemaVersion}, expected 1.");
                    if (catalog.Kind != "prefab-catalog")
                        Debug.LogWarning($"[UnityMCP] {prefabFile}: kind is '{catalog.Kind}', expected 'prefab-catalog'.");

                    prefabCount = catalog.Prefabs?.Count ?? 0;
                    var categories = new HashSet<string>();
                    if (catalog.Prefabs != null)
                    {
                        foreach (var p in catalog.Prefabs)
                        {
                            if (string.IsNullOrEmpty(p.Name) || string.IsNullOrEmpty(p.Package) || string.IsNullOrEmpty(p.Path))
                            {
                                Debug.LogWarning($"[UnityMCP] {prefabFile}: prefab entry missing name/package/path.");
                                prefabPathErrors++;
                                continue;
                            }
                            if (!string.IsNullOrEmpty(p.Category)) categories.Add(p.Category);
                            var (status, _) = Mrtk3PathResolver.Resolve(p.Package, p.Path);
                            if (status == Mrtk3PathResolver.Status.PathMissing)
                            {
                                Debug.LogWarning($"[UnityMCP] {prefabFile}: '{p.Name}' path '{p.Path}' missing inside installed package '{p.Package}'.");
                                prefabPathErrors++;
                            }
                        }
                    }
                    categoryCount = categories.Count;

                    if (prefabPathErrors == 0)
                        Debug.Log($"[UnityMCP] {prefabFile}: 0 errors. count={prefabCount} categories={categoryCount}");
                }
            }
            else
            {
                Debug.LogWarning("[UnityMCP] prefabs.yaml not found in corpus directory.");
            }

            Debug.Log($"[UnityMCP] Corpus validation complete: {passing}/{entries.Count} entries passed; prefabs count={prefabCount} categories={categoryCount} pathErrors={prefabPathErrors}.");
        }

        [MenuItem("Tools/UnityMCP/Probe Mrtk3 Path Resolver")]
        public static void ProbePathResolver()
        {
            var probes = new (string package, string relativePath, string note)[]
            {
                ("org.mixedrealitytoolkit.uxcore", "Button/PressableButton.cs", "expected Resolved when uxcore installed"),
                ("org.mixedrealitytoolkit.uxcore", "Bogus/DoesNotExist.cs", "expected PathMissing when uxcore installed"),
                ("org.mixedrealitytoolkit.does-not-exist", "anything", "expected PackageMissing"),
            };

            foreach (var (package, relativePath, note) in probes)
            {
                var (status, abs) = Mrtk3PathResolver.Resolve(package, relativePath);
                Debug.Log($"[UnityMCP] PathResolver({package}, {relativePath}) = {status} ({note})\n  abs={abs ?? "<null>"}");
            }
        }

        private static string ResolveFixtureDir()
        {
            return ResolveFixtureDirSilent() ?? LogAndReturnNull();
        }

        private static string ResolveFixtureDirSilent()
        {
            try
            {
                var info = PackageInfo.FindForPackageName(PackageName);
                if (info != null && !string.IsNullOrEmpty(info.resolvedPath))
                {
                    var dir = Path.Combine(info.resolvedPath, "Editor", "Mrtk3Knowledge", "Fixtures");
                    if (Directory.Exists(dir)) return dir;
                }
            }
            catch { /* fall through */ }
            return null;
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
            Debug.LogError("[UnityMCP] Cannot resolve Mrtk3Knowledge corpus directory.");
            return null;
        }

        private static string LogAndReturnNull()
        {
            Debug.LogError("[UnityMCP] Cannot resolve Mrtk3Knowledge/Fixtures directory.");
            return null;
        }
    }
}
