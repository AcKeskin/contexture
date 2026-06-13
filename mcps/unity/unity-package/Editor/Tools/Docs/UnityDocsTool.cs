using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace UnityMcp.Editor.Tools.Docs
{
    /// <summary>
    /// Read-only fetcher for official Unity documentation pages. Two actions:
    ///
    ///   lookup — ScriptReference page for a type or member (e.g.
    ///         "UnityEngine.GameObject", "Transform.position",
    ///         "Material.SetTexture"). Strips the leading "UnityEngine."
    ///         namespace because Unity's docs URLs don't include it.
    ///
    ///   manual — Manual/* page lookup (e.g. "Profiler", "OverviewOfDOTS").
    ///         For when the user wants the prose explainer rather than the
    ///         API reference.
    ///
    /// Returns { url, title, description, sections[] }. Description is the
    /// first paragraph from any parsed section that is at least 30 chars long
    /// and not part of Unity's docs-feedback boilerplate ("Thank you for
    /// helping us improve…", "Submission failed", etc.). Sections are
    /// paragraph-grouped blocks under each h1/h2/h3. No full HTML — agents
    /// just need enough to confirm a page exists and quote its prose.
    /// Responses cache in-memory per Editor session keyed by URL (Unity
    /// docs are stable).
    /// </summary>
    [UnityMcpTool("unity_docs")]
    internal sealed class UnityDocsTool : IUnityMcpTool
    {
        private const int DefaultTimeoutSeconds = 15;
        private const string DocsRootScriptRef = "https://docs.unity3d.com/ScriptReference";
        private const string DocsRootManual = "https://docs.unity3d.com/Manual";

        // In-memory cache keyed by URL. Static field — reset on every domain
        // reload like any other static. Fine for our use: Unity docs don't
        // change inside a session, and a few hundred entries cost nothing.
        private static readonly Dictionary<string, JObject> _cache = new();

        public string Name => "unity_docs";

        public string Description =>
            "Fetch official Unity documentation pages. action=lookup|manual. " +
            "lookup: required 'symbol' — type FQN ('UnityEngine.GameObject'), " +
            "type short name ('GameObject'), instance member ('Transform.position', " +
            "'Material.SetTexture'), or static member. Strips leading 'UnityEngine.' " +
            "(Unity's URLs omit it). manual: required 'page' — Manual/* page name " +
            "without extension (e.g. 'Profiler', 'OverviewOfDOTS'). Both return " +
            "{ url, title, description, sections: [{ heading, paragraphs[] }] }. " +
            "404 from docs.unity3d.com returns ToolError with the attempted URL. " +
            "Optional 'timeoutSeconds' (default 15, max 60). Responses cache in " +
            "memory for the Editor session.";

        public JObject InputSchema => new JObject
        {
            ["type"] = "object",
            ["properties"] = new JObject
            {
                ["action"] = new JObject
                {
                    ["type"] = "string",
                    ["enum"] = new JArray { "lookup", "manual" },
                },
                ["symbol"] = new JObject { ["type"] = "string" },
                ["page"] = new JObject { ["type"] = "string" },
                ["timeoutSeconds"] = new JObject
                {
                    ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 60, ["default"] = 15,
                },
            },
            ["required"] = new JArray { "action" },
            ["additionalProperties"] = false,
        };

        public async Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
        {
            var action = @params.Value<string>("action");
            int timeoutSec = @params.Value<int?>("timeoutSeconds") ?? DefaultTimeoutSeconds;
            if (timeoutSec < 1) timeoutSec = 1;
            if (timeoutSec > 60) timeoutSec = 60;

            string url;
            switch (action)
            {
                case "lookup":
                    url = BuildScriptReferenceUrl(@params.Value<string>("symbol"));
                    break;
                case "manual":
                    url = BuildManualUrl(@params.Value<string>("page"));
                    break;
                default:
                    throw new ToolException("InvalidInput",
                        $"action must be lookup or manual; got '{action}'.");
            }

            return await FetchAndParse(url, timeoutSec);
        }

        private static string BuildScriptReferenceUrl(string symbol)
        {
            if (string.IsNullOrWhiteSpace(symbol))
                throw new ToolException("InvalidInput", "'symbol' is required for action=lookup.");

            // Unity's docs use three URL shapes:
            //   Class.html                  — type pages
            //   Class-member.html           — instance properties / fields (hyphen)
            //   Class.Method.html           — methods (dot-separated)
            // Strategy: type-only paths (no dot, or nested-type paths with
            // multiple dots) keep their Class.html form. Single-dot symbols
            // pick hyphen-vs-dot by the first char of the suffix:
            //   lowercase first char  → instance property/field   → hyphen
            //   uppercase first char  → method or nested type     → dot
            // C# member-naming convention (PascalCase methods, camelCase
            // fields/properties) makes this heuristic ~99% accurate. For the
            // edge cases that miss, the 404 response surfaces the attempted
            // URL so the caller can retry with the alternate form.
            var trimmed = symbol.Trim();
            if (trimmed.StartsWith("UnityEngine.", StringComparison.Ordinal))
                trimmed = trimmed.Substring("UnityEngine.".Length);
            else if (trimmed.StartsWith("UnityEditor.", StringComparison.Ordinal))
                trimmed = trimmed.Substring("UnityEditor.".Length);

            // Class-member form when there's exactly one dot at the top
            // level of the (de-namespaced) symbol. Nested types preserve
            // their dots (e.g. "GUI.WindowFunction" type page would be
            // GUI.WindowFunction.html — but instance members like
            // "Transform.position" become Transform-position.html).
            int dot = trimmed.IndexOf('.');
            string pathSegment = trimmed;
            if (dot > 0 && trimmed.IndexOf('.', dot + 1) < 0)
            {
                // Single-dot symbol — heuristic: lowercase first char of the
                // suffix → instance member (use hyphen form). Uppercase or
                // mixed → method or nested type (use dot form).
                var suffix = trimmed.Substring(dot + 1);
                if (suffix.Length > 0 && char.IsLower(suffix[0]))
                {
                    pathSegment = trimmed.Substring(0, dot) + "-" + suffix;
                }
            }

            return $"{DocsRootScriptRef}/{Uri.EscapeDataString(pathSegment)}.html"
                .Replace("%2E", ".") // EscapeDataString escapes '.' which Unity's URLs need bare.
                .Replace("%2D", "-");
        }

        private static string BuildManualUrl(string page)
        {
            if (string.IsNullOrWhiteSpace(page))
                throw new ToolException("InvalidInput", "'page' is required for action=manual.");
            var trimmed = page.Trim().TrimEnd('/');
            // Strip a trailing .html if the user pasted a full filename.
            if (trimmed.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
                trimmed = trimmed.Substring(0, trimmed.Length - ".html".Length);
            return $"{DocsRootManual}/{Uri.EscapeDataString(trimmed)}.html"
                .Replace("%2E", ".");
        }

        private static async Task<ToolResult> FetchAndParse(string url, int timeoutSec)
        {
            if (_cache.TryGetValue(url, out var cached))
                return ToolResult.Json(cached);

            string html;
            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = timeoutSec;
                var op = req.SendWebRequest();
                while (!op.isDone) await Task.Yield();

                if (req.result == UnityWebRequest.Result.ConnectionError ||
                    req.result == UnityWebRequest.Result.ProtocolError)
                {
                    if (req.responseCode == 404)
                    {
                        throw new ToolException("ToolError",
                            $"Unity docs returned 404 for '{url}'. The symbol/page name may be wrong, or the API may not be in this Unity version.");
                    }
                    throw new ToolException("ToolError",
                        $"Failed to fetch '{url}': HTTP {req.responseCode} {req.error}.");
                }

                html = req.downloadHandler.text ?? string.Empty;
            }

            var parsed = ParseDocsPage(url, html);
            _cache[url] = parsed;
            return ToolResult.Json(parsed);
        }

        // Unity's ScriptReference / Manual pages share a recognizable structure:
        // <title>Foo.Bar - Unity Script Reference</title>, then a content
        // container with class="content" or id="content-wrap" containing
        // <h2>/<h3> section headers and <p> paragraphs. We do a tag-aware but
        // dependency-free extraction — strip tags, keep text, group by heading.
        private static JObject ParseDocsPage(string url, string html)
        {
            string description;
            JArray sections;
            string h1Title;
            ExtractSections(html, out description, out sections, out h1Title);

            // Prefer the page's own <h1> as the title — Unity's modern docs
            // ship a generic <title>Unity</title>, but the meaningful title
            // (e.g. "GameObject", "Transform.position") sits in an <h1> at
            // the top of the content div.
            string title = !string.IsNullOrEmpty(h1Title) ? h1Title : ExtractTagTitle(html);

            return new JObject
            {
                ["url"] = url,
                ["title"] = title,
                ["description"] = description,
                ["sections"] = sections,
            };
        }

        private static string ExtractTagTitle(string html)
        {
            var m = Regex.Match(html, @"<title>([\s\S]*?)</title>", RegexOptions.IgnoreCase);
            if (!m.Success) return string.Empty;
            var raw = HtmlDecode(StripTags(m.Groups[1].Value)).Trim();
            int dash = raw.LastIndexOf(" - ", StringComparison.Ordinal);
            return dash > 0 ? raw.Substring(0, dash) : raw;
        }

        private static void ExtractSections(string html, out string description, out JArray sections, out string h1Title)
        {
            description = string.Empty;
            sections = new JArray();
            h1Title = string.Empty;

            // Constrain to the main content if we can find it. Unity uses
            // <div class="content"> or <div id="content-wrap">. If neither
            // is found, parse the whole body — defensive fallback.
            string body = html;
            var contentDiv = Regex.Match(html, @"<div\s+(?:class=""content""|id=""content-wrap"")[\s\S]*?>([\s\S]*)", RegexOptions.IgnoreCase);
            if (contentDiv.Success) body = contentDiv.Groups[1].Value;

            // Walk h1/h2/h3 headers. Everything between two headers is one
            // section's paragraphs.
            var headerRegex = new Regex(@"<(h[1-3])[^>]*>([\s\S]*?)</\1>", RegexOptions.IgnoreCase);
            var matches = headerRegex.Matches(body);

            for (int i = 0; i < matches.Count; i++)
            {
                int sectionStart = matches[i].Index + matches[i].Length;
                int sectionEnd = i + 1 < matches.Count ? matches[i + 1].Index : body.Length;
                var sectionBody = body.Substring(sectionStart, sectionEnd - sectionStart);
                var paragraphs = ExtractParagraphs(sectionBody);

                var headingTag = matches[i].Groups[1].Value.ToLowerInvariant();
                var heading = HtmlDecode(StripTags(matches[i].Groups[2].Value)).Trim();

                if (string.IsNullOrEmpty(h1Title) && headingTag == "h1")
                    h1Title = heading;

                if (paragraphs.Count == 0) continue;
                if (string.IsNullOrEmpty(heading)) continue;

                var entry = new JObject { ["heading"] = heading };
                var pArr = new JArray();
                foreach (var p in paragraphs) pArr.Add(p);
                entry["paragraphs"] = pArr;
                sections.Add(entry);
            }

            // Description: first paragraph anywhere in the parsed sections
            // that's >= 30 chars (a meaningful sentence, not a button label
            // like "Cancel" or page chrome that slipped past the filter).
            // Fall back to empty if nothing qualifies — agents can read the
            // sections array directly when the description is sparse.
            foreach (JObject section in sections)
            {
                foreach (var p in (JArray)section["paragraphs"])
                {
                    var text = p.Value<string>();
                    if (!string.IsNullOrEmpty(text) && text.Length >= 30)
                    {
                        description = text;
                        return;
                    }
                }
            }
        }

        private static string ExtractFirstParagraph(string segment)
        {
            var m = Regex.Match(segment, @"<p[^>]*>([\s\S]*?)</p>", RegexOptions.IgnoreCase);
            if (!m.Success) return string.Empty;
            return HtmlDecode(StripTags(m.Groups[1].Value)).Trim();
        }

        private static List<string> ExtractParagraphs(string segment)
        {
            var result = new List<string>();
            foreach (Match m in Regex.Matches(segment, @"<p[^>]*>([\s\S]*?)</p>", RegexOptions.IgnoreCase))
            {
                var text = HtmlDecode(StripTags(m.Groups[1].Value)).Trim();
                if (text.Length == 0) continue;
                // Skip Unity's docs-feedback boilerplate paragraphs. They're
                // injected into every page and crowd out the actual description.
                if (text.StartsWith("Thank you for helping us improve", StringComparison.Ordinal)) continue;
                if (text.StartsWith("Submission failed", StringComparison.Ordinal)) continue;
                if (text.StartsWith("For some reason your suggested change", StringComparison.Ordinal)) continue;
                result.Add(text);
            }
            return result;
        }

        private static string StripTags(string html)
        {
            return Regex.Replace(html ?? string.Empty, @"<[^>]+>", string.Empty);
        }

        private static string HtmlDecode(string text)
        {
            if (string.IsNullOrEmpty(text)) return text ?? string.Empty;
            // Minimal entity decoding — Unity's docs use a small set.
            var sb = new StringBuilder(text.Length);
            int i = 0;
            while (i < text.Length)
            {
                if (text[i] == '&')
                {
                    int semi = text.IndexOf(';', i + 1);
                    if (semi > i && semi - i <= 8)
                    {
                        var entity = text.Substring(i + 1, semi - i - 1);
                        var replaced = entity switch
                        {
                            "amp" => "&",
                            "lt" => "<",
                            "gt" => ">",
                            "quot" => "\"",
                            "apos" => "'",
                            "nbsp" => " ",
                            _ when entity.StartsWith("#") => DecodeNumeric(entity),
                            _ => null,
                        };
                        if (replaced != null)
                        {
                            sb.Append(replaced);
                            i = semi + 1;
                            continue;
                        }
                    }
                }
                sb.Append(text[i]);
                i++;
            }
            return sb.ToString();
        }

        private static string DecodeNumeric(string entity)
        {
            // entity is "#NN" or "#xNN".
            if (entity.Length < 2) return null;
            try
            {
                int code = entity[1] == 'x' || entity[1] == 'X'
                    ? Convert.ToInt32(entity.Substring(2), 16)
                    : int.Parse(entity.Substring(1));
                return char.ConvertFromUtf32(code);
            }
            catch { return null; }
        }
    }
}
