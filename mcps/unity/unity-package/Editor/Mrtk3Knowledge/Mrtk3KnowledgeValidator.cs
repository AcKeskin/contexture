using System.Collections.Generic;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Pure validation pass over a single corpus entry. Returns one error
    /// string per problem found, in source order — never throws.
    ///
    /// Path-bearing fields (<see cref="Mrtk3KnowledgeEntry.SourceFile"/>,
    /// <see cref="Mrtk3CanvasVariants.Canvas"/>/<c>NonCanvas</c>) are checked
    /// via <see cref="Mrtk3PathResolver"/>: PackageMissing soft-skips silently
    /// (the user doesn't have that package); PathMissing surfaces as a real
    /// error (the corpus's path is stale inside an installed package).
    ///
    /// The id-uniqueness check sits outside this method — the loader has the
    /// full corpus and can detect collisions across files.
    /// </summary>
    internal static class Mrtk3KnowledgeValidator
    {
        private const int CurrentSchemaVersion = 1;

        public static IReadOnlyList<string> Validate(
            Mrtk3KnowledgeEntry entry,
            string sourceFile,
            IReadOnlyDictionary<string, Mrtk3KnowledgeEntry> idIndex)
        {
            var errors = new List<string>();

            if (entry == null)
            {
                errors.Add($"{sourceFile}: entry is null after deserialization.");
                return errors;
            }

            if (entry.SchemaVersion != CurrentSchemaVersion)
                errors.Add($"{sourceFile}: schemaVersion is {entry.SchemaVersion}, expected {CurrentSchemaVersion}.");

            if (string.IsNullOrEmpty(entry.Id))
                errors.Add($"{sourceFile}: required field 'id' is missing.");
            if (string.IsNullOrEmpty(entry.Name))
                errors.Add($"{sourceFile}: required field 'name' is missing.");
            if (string.IsNullOrEmpty(entry.Kind))
                errors.Add($"{sourceFile}: required field 'kind' is missing.");

            if (entry.Kind == "component")
            {
                if (string.IsNullOrEmpty(entry.Namespace))
                    errors.Add($"{sourceFile}: component entry missing 'namespace'.");
                if (string.IsNullOrEmpty(entry.Package))
                    errors.Add($"{sourceFile}: component entry missing 'package'.");
                if (string.IsNullOrEmpty(entry.SourceFile))
                    errors.Add($"{sourceFile}: component entry missing 'sourceFile'.");
                if (string.IsNullOrEmpty(entry.Purpose))
                    errors.Add($"{sourceFile}: component entry missing 'purpose'.");

                CheckPackagePath(errors, sourceFile, entry.Package, entry.SourceFile, "sourceFile");
                if (entry.CanvasVariants?.Canvas != null)
                    CheckPackagePathRecord(errors, sourceFile, entry.CanvasVariants.Canvas, "canvasVariants.canvas");
                if (entry.CanvasVariants?.NonCanvas != null)
                    CheckPackagePathRecord(errors, sourceFile, entry.CanvasVariants.NonCanvas, "canvasVariants.nonCanvas");
            }
            else if (entry.Kind == "decision-rule")
            {
                if (string.IsNullOrEmpty(entry.Question))
                    errors.Add($"{sourceFile}: decision-rule entry missing 'question'.");
                if (string.IsNullOrEmpty(entry.DecisionTree))
                    errors.Add($"{sourceFile}: decision-rule entry missing 'decisionTree'.");
            }
            else if (!string.IsNullOrEmpty(entry.Kind))
            {
                errors.Add($"{sourceFile}: unknown kind '{entry.Kind}' (expected 'component' or 'decision-rule').");
            }

            if (entry.RelatedRules != null && idIndex != null)
            {
                foreach (var related in entry.RelatedRules)
                {
                    if (string.IsNullOrEmpty(related)) continue;
                    if (!idIndex.ContainsKey(related))
                        errors.Add($"{sourceFile}: relatedRules entry '{related}' does not resolve to a known corpus id.");
                }
            }

            return errors;
        }

        private static void CheckPackagePath(List<string> errors, string sourceFile, string packageName, string relativePath, string fieldName)
        {
            if (string.IsNullOrEmpty(packageName) || string.IsNullOrEmpty(relativePath)) return;
            var (status, _) = Mrtk3PathResolver.Resolve(packageName, relativePath);
            if (status == Mrtk3PathResolver.Status.PathMissing)
                errors.Add($"{sourceFile}: {fieldName} '{relativePath}' does not exist inside installed package '{packageName}'.");
        }

        private static void CheckPackagePathRecord(List<string> errors, string sourceFile, Mrtk3PackagePath record, string fieldName)
        {
            if (string.IsNullOrEmpty(record.Package))
                errors.Add($"{sourceFile}: {fieldName} missing 'package'.");
            if (string.IsNullOrEmpty(record.Path))
                errors.Add($"{sourceFile}: {fieldName} missing 'path'.");
            CheckPackagePath(errors, sourceFile, record.Package, record.Path, $"{fieldName}.path");
        }
    }
}
