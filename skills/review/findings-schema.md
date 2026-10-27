# findings.json

One file per review run. The terminal report, the vault markdown and the review page are all rendered from it, so they never disagree. `walk` saves progress into it.

**Where it lives.** Local target: `.claude/reviews/<scope-slug>/v<N>.json` next to `v<N>.md`, plus `latest.json`. PR target: `.claude/reviews/pr-<NNN>/v<N>.json` + `latest.json` (and next to the vault file when one is written). Same atomic write order as the markdown artefact.

```jsonc
{
  "version": 1,
  "run": {
    "target": "pr",                       // local | since | pr
    "title": "PR #42 — Add rate limiting",
    "scope": "src/api/ (12 files)",
    "url": "https://github.com/o/r/pull/42", // optional
    "base": "main", "head": "feat/rate-limit", // optional
    "date": "2026-10-27",
    "verdict": "COMMENT",                 // PR targets only
    "verdict_reason": "…",                // one or two sentences
    "rules": "5 architectural rules",     // or "none"
    "artifact_url": null,                 // set after the first publish; reused on re-runs
    "frontmatter": {}                     // caller's own note keys (review SKILL.md §10), written first by render-note.mjs
  },
  "metrics": [                            // the human's first view; see SKILL.md §Metrics
    { "id": "size", "label": "Change size", "value": "+412 / -88", "note": "9 files in 3 modules", "source": "git diff --stat" },
    { "id": "blast", "label": "Blast radius", "value": 23, "note": "files importing a touched file", "source": "codemap File deps" },
    { "id": "surface", "label": "Public surface", "value": "+3 / ~1 / -0", "note": "exports added / changed / removed", "source": "codemap exports" }
  ],
  "coverage": [
    { "angle": "correctness", "files": 12, "findings": 4, "status": "ok" },        // ok | failed | skipped
    { "angle": "readability", "files": 0, "findings": 0, "status": "skipped", "reason": "diff < 200 added lines" }
  ],
  "findings": [{
    "id": "F001",                         // stable across runs and iterations; rank is display order only
    "file": "src/api/limit.ts", "line": "42-48",
    "severity": "high",                   // critical | high | medium | low
    "effort": "S",                        // S | M | L
    "category": "performance",            // the caller's category or the angle name
    "angles": ["performance", "correctness"],
    "verdict": "confirmed",               // confirmed | plausible | unverified
    "title": "Redis call per request inside the loop",
    "impact": "Rate-limit checks get slower as a request names more keys.", // one plain line for the human: what it costs, not how
    "chain": ["routes.ts:18 handler", "limit.ts:40 checkAll", "limit.ts:44 redis.incr"], // call path the model followed
    "what": "One round-trip per key; 50 keys → 50 calls on the request path.",
    "quote": "for (const k of keys) await redis.incr(k)",
    "fix": "Batch with a pipeline.",
    "suggestion": "await redis.pipeline(keys.map(k => ['incr', k])).exec()", // literal block or null
    "verifier": "Confirmed: keys comes from the request body, unbounded (routes.ts:18).",
    "status": "open",                     // open | kept | dropped | wontfix
    "reason": null,                       // wontfix reason
    "notes": []                           // walk Q&A, one line each
  }],
  "tensions": [{
    "id": "T1", "file": "src/feed/render.ts", "line": "40-72",
    "sides": [
      { "angle": "performance", "say": "Inline the formatter; it runs per item." },
      { "angle": "readability", "say": "Keep it extracted; export.ts:18 reuses it." }
    ],
    "settle": "Profile the 10k-row case, or confirm export.ts stays.",
    "status": "open"                      // open | a | b | skip
  }],
  "needs_validation": [{ "file": "src/api/export.ts", "line": "88", "claim": "…", "gap": "…", "settle": "…" }],
  "fine": [{ "file": "src/auth/permissions.ts", "line": "240", "why": "…" }],
  "pack": {                               // human-view code mode; omit when no pack was built
    "summary": "…",
    "sections": [
      { "id": "structure", "title": "Structure", "text": "…", "mermaid": ["flowchart LR …"] },
      { "id": "call-flow", "title": "Call flow", "text": "…", "mermaid": ["sequenceDiagram …"] },
      { "id": "building-on-top", "title": "Building on top", "text": "…" },
      { "id": "performance", "title": "Performance", "text": "…" }
    ]
  },
  "walk": { "cursor": "F004", "filter": "high+" } // last walk position; null when none
}
```

`text` fields take plain paragraphs (blank line between), `- ` bullets and `` `code` ``. Nothing else is parsed.
