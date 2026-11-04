---
name: update-codemap
description: Regenerate the project codemap at .claude/codemap.md — produce an LLM-facing architecture document with prose overview, per-module roles, detected conventions, hub files, and structured file/class graphs for downstream visualization. Use when the user types /update-codemap or asks to refresh / create / update the codemap for the current project.
---

# update-codemap

Generates an LLM-facing architecture document for the current project: a prose Overview, per-module roles (Role / Purpose / Entry / Public surface / Depends on / Imported by / Internals), evidence-based detected conventions, hub files ranked by importer count, and structured file-level + class-level graphs that downstream tools (notably `visualise-codemap`) consume to render diagrams and UML. Full-rewrite each run. Per-project, lives in the project's own git repo at `.claude/codemap.md`. The audience is LLMs and agents (consumed by `/prep`, `/discover`, and any agent that needs architectural context) — prose-heavy at the top, structured sections below.

## How to run (for Claude Code)

This skill is implemented as a standalone Node script — [`codemap.mjs`](./codemap.mjs), co-located in this skill folder. The procedure below is the contract the script implements; treat it as the spec.

Run the script from this skill's folder, never relative to CWD or a hardcoded path. Claude Code fills in `${CLAUDE_SKILL_DIR}` below. In another tool it stays literal: use the folder this SKILL.md is in instead.

```sh
# device-agnostic: resolve the skill's real dir (collapses the ~/.claude symlink), run the co-located script
SKILL_DIR="${CLAUDE_SKILL_DIR}"
node "$SKILL_DIR/codemap.mjs"                 # writes .claude/codemap.md
node "$SKILL_DIR/codemap.mjs" --dry-run       # preview to stdout, no write
node "$SKILL_DIR/codemap.mjs" --root <dir>    # explicit project root
node "$SKILL_DIR/codemap.mjs" --map-tokens N  # cap doc size ~N tokens (trims index sections only)
node "$SKILL_DIR/codemap.mjs" --no-cache      # ignore the per-file cache, full re-parse
```

Regeneration is **incremental**: a per-file extraction cache at `.claude/codemap.cache.json` (gitignored, beside `codemap.md`) is validated by each file's size + mtime, so an unchanged file skips its read + parse (the tree-sitter pass is the expensive part). A changed/added/removed file re-extracts. `--no-cache` forces a cold rebuild; a bumped cache version or a corrupt cache file degrades safely to cold. The cache can only make a run slower on a miss, never produce a wrong map.

If the skill folder can't be found, the script also lives at the canonical `contexture/skills/update-codemap/codemap.mjs`; run it with an explicit `--root .` against the target project.

### Multi-language extraction (tree-sitter)

Class graph, exports, and import edges for **Python, Java, Kotlin, Swift, Rust, Go, and C++** come from tree-sitter (AST), via the optional deps in this skill's `package.json`. One-time install, from the skill folder:

```sh
npm install --prefix "$SKILL_DIR"     # fetches web-tree-sitter + tree-sitter-wasms (~30 MB, gitignored)
```

Without the deps the script **degrades gracefully**: TS/C#/C++ still extract via regex; the other languages index as files with no class graph or edges (a log line points here). TypeScript and C# always use the regex extractors (mature, no AST needed). Coverage is verified end-to-end by `test/language-sweep.mjs` — run it after any extractor change; it must pass with zero failures (currently 96/96 across 12 languages; Swift's file-edge is `n/a` — Swift has no file-level import syntax). The `web-tree-sitter` pin is `~0.25` deliberately: 0.26+ dropped the grammar ABI that `tree-sitter-wasms@0.1.13` ships, and 0.24− is CommonJS-only.

The script honors `$CLAUDE_PROJECT_DIR`, reads `.claude/codemap.config.md` (skip patterns, layers, auto-update toggle), clears `.claude/codemap.dirty` after a successful write, and prints the diff summary on stdout. Surface the diff summary to the user; do not paraphrase. If the script fails, the error message tells you which spec step it choked on — fix the input or extend the script.

## When to run

- User types `/update-codemap`.
- User asks to refresh / create / update the codemap.
- Do **not** auto-fire. The `codemap-refresh` hook keeps it fresh: when the codemap is behind, it regenerates it in the background. That is on by default when git doesn't track the codemap; a tracked one needs `- refresh: true` (see `## Auto-update` below). Where it can't refresh, it says at session start when the codemap is 5+ files behind.
- Codemap is a map, not the territory. This skill does not replace reading the actual code when implementation details matter.

## Inputs

1. **Project root.** `$CLAUDE_PROJECT_DIR` if set, otherwise the current working directory. Resolve to an absolute path; write `.claude/codemap.md` relative to that.
2. **Previous codemap**, if present at `<root>/.claude/codemap.md`. Used for the diff summary at the end. Never used as input to what to scan — always scan from the filesystem.
3. **Dirty sentinel**, if present at `<root>/.claude/codemap.dirty`. Indicates the codemap-dirty hook flagged the codemap stale since the last run. Acknowledge in the report and delete the sentinel after a successful write.

## Procedure

`codemap.mjs` implements the procedure; you run it, you don't re-implement it. The full spec (file list and skip rules, per-language extraction, the output layout, atomic write, the diff summary) is in [spec.md](spec.md). Read it when a run's output looks wrong or when changing the script.

After a run, pass on the script's diff summary (files added and removed, purpose and export changes, or the initial-scan line) and say if a config file was applied.

## Per-project config file format

`.claude/codemap.config.md` is optional. When present, it extends the skip list, declares architectural layers, marks vendored folders, and toggles the auto-update dirty hook.

Full example:

```markdown
# Codemap config

## Skip

- `Library/`
- `Builds/`
- `Assets/Plugins/ThirdParty/`
- `*.gen.cs`
- `**/snapshots/`

## Vendored

- `include/openxr/`
- `third_party/**`

## Layers

- Domain: domain, model
- Application: app, services, use-cases
- Infrastructure: persistence, http, adapters
- Presentation: ui, web, mobile

## Auto-update

- enabled: true
- refresh: true
```

**Section reference:**

- `## Skip` — additive to defaults. Bullet list of backtick-quoted gitignore-style globs. See §2 parsing rules.
- `## Vendored` — bullet list of backtick-quoted gitignore-style globs. Files under these patterns are scanned for tree structure but get `<vendored>` as their purpose line and no `exports:` entry. Imports out of vendored files are not emitted into `## Dependencies` / `## File deps`. Use this for in-tree third-party SDKs (e.g. bundled OpenXR headers) that you want represented in the tree but not as part of the project's surface area. Imports *into* vendored files (e.g. project code that `#include`s a bundled header) still produce edges — vendored is about ownership of the file, not visibility.
- `## Layers` — `<LayerName>: <module>, <module>, ...` per bullet. Module names match top-level directories. Surfaces in the codemap's `## Layers` section and is consumed by `visualise-codemap` to cluster L1 nodes.
- `## Auto-update` — `enabled: true` (or `- enabled: true`) opts the project into the codemap-dirty hook. The hook touches `.claude/codemap.dirty` on any project-tree write so the next `/update-codemap` run knows the codemap is stale. Anything other than `enabled: true` (missing line, `enabled: false`, missing section) keeps the project opt-out — no sentinel is ever written. The hook is registered globally; this section is the per-project gate. `refresh` controls background regeneration by the `codemap-refresh` hook at session start and after each turn, whenever git shows files changed since the codemap was written. Unset, it is on when git doesn't track `.claude/codemap.md` and off when it does, so a committed codemap doesn't churn; `refresh: true` or `refresh: false` overrides. It is incremental (extraction cache) and needs this skill's tree-sitter deps (`npm install` here); without them the hook only advises, so a refresh never downgrades to the regex fallback.

**Glob semantics (Skip and Vendored):**
- `*` matches a single path segment.
- `**` crosses segments.
- A trailing `/` makes the pattern directory-anchored — `Library/` matches the `Library` directory itself and everything under it.
- Patterns match relative to the project root. A pattern without a leading `**/` or `/` still matches at any depth (gitignore-compatible).

Notes:
- Headings are exact, case-sensitive.
- Prose around sections is fine — only the documented bullet lines are read.
- File absent or empty: skill behaves exactly as it does without the file. No section is mandatory.
- Unknown sections are ignored. Reserved for future use.

More in [reference.md](reference.md): What update-codemap does NOT do, limits (v1).
