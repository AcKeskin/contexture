using System.Collections.Generic;

namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Per-component or per-decision-rule corpus entry. One YAML file → one
    /// instance. <see cref="Kind"/> selects which subset of fields is
    /// populated: "component" entries fill purpose/useWhen/events/canvasVariants/etc.;
    /// "decision-rule" entries fill question/decisionTree/examples instead.
    /// The shared fields (id, name, kind, relatedRules) live on the same type
    /// rather than as a discriminated union — YamlDotNet round-trip is simpler
    /// with nullable optional members, and the tool layer skips nulls when
    /// emitting JSON.
    ///
    /// v2 schema: paths are (package, path) records, not bare strings. The
    /// `exampleScenes` field from v1 is gone — sample scenes ship only with
    /// MRTKDevTemplate, not with end-user UPM installs, so the corpus instead
    /// captures the patterns observed in those scenes via the prose
    /// `referenceUsage` list.
    /// </summary>
    internal sealed class Mrtk3KnowledgeEntry
    {
        public int SchemaVersion { get; set; }
        public string Id { get; set; }
        public string Kind { get; set; }
        public string Name { get; set; }

        // component-only
        public string Namespace { get; set; }
        public string Package { get; set; }
        public string Extends { get; set; }
        public string SourceFile { get; set; }
        public string Purpose { get; set; }
        public List<string> UseWhen { get; set; }
        public List<string> DontUseWhen { get; set; }
        public List<Mrtk3Alternative> Alternatives { get; set; }
        public Mrtk3CanvasVariants CanvasVariants { get; set; }
        public List<string> RequiredCompanions { get; set; }
        public List<Mrtk3EventEntry> Events { get; set; }
        public string AuthoringPattern { get; set; }
        public List<string> ReferenceUsage { get; set; }
        public List<string> KnownPitfalls { get; set; }

        // decision-rule-only
        public string Question { get; set; }
        public string DecisionTree { get; set; }
        public List<string> Examples { get; set; }

        // shared — stored as bare ids in YAML; rehydrated to {id, summary} on the wire
        public List<string> RelatedRules { get; set; }
    }

    internal sealed class Mrtk3Alternative
    {
        public string Id { get; set; }
        public string When { get; set; }
    }

    /// <summary>
    /// Per-variant package + path. Both members are nullable: a component
    /// might ship only a Canvas variant, only a non-Canvas variant, or both.
    /// </summary>
    internal sealed class Mrtk3CanvasVariants
    {
        public Mrtk3PackagePath Canvas { get; set; }
        public Mrtk3PackagePath NonCanvas { get; set; }
    }

    internal sealed class Mrtk3EventEntry
    {
        public string Name { get; set; }
        public string DefinedOn { get; set; }
    }
}
