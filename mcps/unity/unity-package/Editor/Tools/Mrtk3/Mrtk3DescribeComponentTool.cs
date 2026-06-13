using System;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using UnityEngine;
using UnityMcp.Editor.Capabilities;
using UnityMcp.Editor.Mrtk3Knowledge;

namespace UnityMcp.Editor.Tools.Mrtk3
{
    /// <summary>
    /// Returns the curated knowledge entry for an MRTK 3 component — by short
    /// type name or by an instanceId pointing at a live component in the
    /// scene. The entry carries purpose / useWhen / dontUseWhen / canvasVariants /
    /// referenceUsage / pitfalls etc., with relatedRules expanded one hop so
    /// the agent gets the cross-cutting decision-rule summaries inline.
    ///
    /// Lookup by instanceId walks the type chain: a custom subclass of an
    /// MRTK type returns the nearest base entry with <c>inheritedFrom</c>
    /// set so the agent knows it's reading the parent's knowledge.
    /// </summary>
    [UnityMcpTool("mrtk3_describe_component", Requires = new[] { CapabilityKey.Mrtk })]
    internal sealed class Mrtk3DescribeComponentTool : IUnityMcpTool
    {
        private static readonly JsonSerializer _serializer = JsonSerializer.Create(new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore,
        });

        public string Name => "mrtk3_describe_component";

        public string Description =>
            "Returns the curated MRTK 3 knowledge entry for a component. Call by name " +
            "({componentName: 'PressableButton'}) or by instanceId ({componentInstanceId: N}). " +
            "InstanceId resolves the live component, walks its type chain, returns the " +
            "nearest matching corpus entry — custom subclasses get 'inheritedFrom' set. " +
            "relatedRules are expanded one hop with summaries.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["componentName"] = new JObject { ["type"] = "string" },
                ["componentInstanceId"] = new JObject { ["type"] = "integer" },
            },
            ["additionalProperties"] = false,
        };

        public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var name = @params.Value<string>("componentName");
            var idToken = @params["componentInstanceId"];
            int? instanceId = idToken != null && idToken.Type != JTokenType.Null ? idToken.Value<int?>() : null;

            if (string.IsNullOrEmpty(name) && instanceId == null)
                throw new ToolException("InvalidInput", "Provide either 'componentName' or 'componentInstanceId'.");
            if (!string.IsNullOrEmpty(name) && instanceId != null)
                throw new ToolException("InvalidInput", "Provide exactly one of 'componentName' or 'componentInstanceId', not both.");

            var corpus = Mrtk3KnowledgeCorpus.Get();

            Mrtk3KnowledgeEntry entry;
            string inheritedFrom = null;

            if (!string.IsNullOrEmpty(name))
            {
                entry = corpus.GetByName(name);
                if (entry == null)
                    throw new ToolException("InvalidInput", $"No knowledge entry for componentName '{name}'.");
            }
            else
            {
                var comp = InstanceIdResolver.ComponentOrThrow(instanceId.Value);
                if (!Mrtk3Types.IsMrtkAssembly(comp.GetType().Assembly.GetName().Name))
                {
                    throw new ToolException("InvalidInput",
                        $"componentInstanceId {instanceId.Value} is {comp.GetType().Name} — not an MRTK 3 component.");
                }

                // Walk the type chain to find the nearest corpus match.
                Type t = comp.GetType();
                Mrtk3KnowledgeEntry match = null;
                string matchedShortName = null;
                while (t != null && t != typeof(object))
                {
                    match = corpus.GetByName(t.Name);
                    if (match != null) { matchedShortName = t.Name; break; }
                    t = t.BaseType;
                }
                if (match == null)
                {
                    throw new ToolException("InvalidInput",
                        $"No knowledge entry for {comp.GetType().Name} or any base type.");
                }

                entry = match;
                if (matchedShortName != comp.GetType().Name)
                    inheritedFrom = matchedShortName;
            }

            var entryJson = JObject.FromObject(entry, _serializer);

            // Re-shape relatedRules: YAML stores bare ids; expand to {id, summary}
            // by re-querying the corpus and pulling the related entry's purpose
            // (or question, for decision-rules) first sentence.
            entryJson.Remove("relatedRules");
            if (entry.RelatedRules != null && entry.RelatedRules.Count > 0)
            {
                var expanded = new JArray();
                foreach (var relatedId in entry.RelatedRules)
                {
                    var related = corpus.GetById(relatedId);
                    var summary = related != null
                        ? FirstSentence(related.Purpose ?? related.Question ?? string.Empty)
                        : "(unknown id)";
                    expanded.Add(new JObject
                    {
                        ["id"] = relatedId,
                        ["summary"] = summary,
                    });
                }
                entryJson["relatedRules"] = expanded;
            }

            if (!string.IsNullOrEmpty(inheritedFrom))
                entryJson["inheritedFrom"] = inheritedFrom;

            // Envelope: packageInstalled status (per criterion) + corpus error count if non-zero.
            var envelope = new JObject
            {
                ["packageInstalled"] = string.IsNullOrEmpty(entry.Package)
                    ? (JToken)JValue.CreateNull()
                    : Mrtk3PathResolver.IsPackageInstalled(entry.Package),
            };
            if (corpus.ErrorCount > 0)
                envelope["corpusErrors"] = corpus.ErrorCount;
            entryJson["_envelope"] = envelope;

            return Task.FromResult(ToolResult.Json(entryJson));
        }

        private static string FirstSentence(string text)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;
            // Trim leading whitespace from the multi-line YAML | block.
            text = text.TrimStart('\r', '\n', ' ', '\t');
            int dot = text.IndexOf('.');
            int newline = text.IndexOf('\n');
            int cut = -1;
            if (dot >= 0 && (newline < 0 || dot < newline)) cut = dot + 1;
            else if (newline >= 0) cut = newline;
            return cut > 0 ? text.Substring(0, cut).Trim() : text.Trim();
        }
    }
}
