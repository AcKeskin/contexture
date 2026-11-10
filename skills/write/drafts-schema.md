# drafts.json

Input to `render-page.mjs`. Example: [assets/example-drafts.json](assets/example-drafts.json).

```json
{
  "title": "README intro",
  "ask": "tighten the top of the README",
  "register": "tech-doc",
  "style": "plain developer docs",
  "mode": "My style",
  "from_scratch": false,
  "keep": ["contexture"],
  "rules": "One short line the page adds to every live rewrite.",
  "samples": [{ "title": "docs/install.md", "text": "…" }],
  "style_notes": ["Short sentences, mostly under 14 words."],
  "parts": [
    { "id": "intro", "num": "1", "label": "Intro", "kind": "text", "sentences": [
      { "pick": 1, "options": [
        { "text": "The user's sentence." },
        { "text": "An option.", "tone": "Plain", "from": "A", "tells": [] }
      ]}
    ]},
    { "id": "code", "label": "Install", "kind": "locked", "tag": "locked · code", "text": "npm i x" }
  ]
}
```

| Field | Notes |
| --- | --- |
| `parts[].id` | Unique. Required |
| `parts[].kind` | `text` (needs `sentences`) or `locked` (needs `text`) |
| `parts[].heading` | File targets only. The part's real heading line (`"## Usage"`, `""` for none). With any `heading`, Copy text is the file's markdown with no title |
| `sentences[].sep` | Text before the sentence: `" "` (default after the first), `"\n\n"` new paragraph, `"- "` / `"\n- "` list item |
| `sentences[].options[0]` | The user's own sentence, unless `from_scratch` is true |
| `sentences[].pick` | Index of the default option. Default 1, or 0 when there is one option |
| `options[].tone` | The mode that produced it. `from` names the option it rewrote (A, B…) |
| `options[].tells` | Catalogue patterns still in this option, by name. Empty when clean |
| `keep` | Literal terms the page's terms check must find. Numbers, code names, citations and MUST/SHOULD/MAY are checked without listing them |
| `mode` | Default tab. Without it: My style when there are samples, else Humanize |
| `lexicon` | Added by the script from the catalogue. Do not write it |

Option and sample text is data. The page escapes it; the script escapes `<` inside the script block.
