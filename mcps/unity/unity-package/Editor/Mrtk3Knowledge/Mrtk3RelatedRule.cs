namespace UnityMcp.Editor.Mrtk3Knowledge
{
    /// <summary>
    /// Expanded form of a relatedRules entry as emitted on the wire.
    /// In YAML the corpus stores just the id string; the tool layer rehydrates
    /// each id by re-querying the index and attaching a summary derived from
    /// the target entry's purpose (or question, for decision rules).
    /// </summary>
    internal sealed class Mrtk3RelatedRule
    {
        public string Id { get; set; }
        public string Summary { get; set; }
    }
}
