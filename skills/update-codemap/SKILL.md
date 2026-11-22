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
node "$SKILL_DIR/codemap.mjs"                 # writes .claude/codemap.md + .claude/codemap.json
node "$SKILL_DIR/codemap.mjs" --dry-run       # preview to stdout, no write
node "$SKILL_DIR/codemap.mjs" --root <dir>    # explicit project root
node "$SKILL_DIR/codemap.mjs" --map-tokens N  # cap codemap.md at ~N tokens (default 32000, 0 = no cap)
node "$SKILL_DIR/codemap.mjs" --no-cache      # ignore the per-file cache, full re-parse
```

**Modules.** A module is a top-level folder, or a nested sub-project: a folder with its own manifest (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `*.csproj`, `*.asmdef`, ...), the deepest one winning. A folder with more than 12 sub-projects under it (`extensions/*`, `playground/**`) is one module that lists them. Each sub-project module shows its manifest, its manifest's description as its role, and the entry points its own manifest names. `## Modules` in the config file overrides this (see below).

**Two outputs.** `codemap.md` is the agent-facing document, kept under a size cap (default ~32k tokens). Over the cap it trims, least useful first and each with a note: class graph, call sequence, references, export lines in the file listings, symbol index, call graph, file deps, conventions, hubs, whole file bullets (least-imported first), and last the least important module blocks. The overview, map, recent activity, entry points, layers and dependencies always stay. Order and details in [spec.md](spec.md) §6a. `codemap.json` beside it holds everything uncapped for tools: per file its language, size, lines, content hash, purpose, outline (classes and functions with line ranges, exports with signatures), resolved imports and importers, the tests that reach it, and git activity; plus module edges, every class, every in-scope call edge and call sequence. The contexture-ui pane, visualise-codemap, affected-tests and the project-memory MCP (/discover, ranked_map, find_symbol, tests_for) read it, so they see every file even when the markdown is thinned. Per file it lists the 20 nearest tests and a `testsTotal` when more reach it. Layout in [spec.md](spec.md) §9.

**Speed.** Each file's syntax tree is walked once (`indexTree` in `treesitter.mjs`) and every extractor reads that list; with 64+ files to parse, worker threads (`extract-worker.mjs`, up to 8) parse them in parallel. A cold run on ~1,000 files takes about 2s.

Regeneration is **incremental**: a per-file extraction cache at `.claude/codemap.cache.json` (gitignored, beside `codemap.md`) is validated by each file's size + mtime, so an unchanged file skips its read + parse (the tree-sitter pass is the expensive part). A changed/added/removed file re-extracts. `--no-cache` forces a cold rebuild; a bumped cache version or a corrupt cache file degrades safely to cold. The cache can only make a run slower on a miss, never produce a wrong map.

If the skill folder can't be found, the script also lives at the canonical `contexture/skills/update-codemap/codemap.mjs`; run it with an explicit `--root .` against the target project.

### Multi-language extraction (tree-sitter)

Class graph, exports, import edges and call edges for **TypeScript/JavaScript, C#, Python, Java, Kotlin, Swift, Rust, Go, C, C++, Ruby and PHP** come from tree-sitter (AST), via the optional deps in this skill's `package.json`. One-time install, from the skill folder:

```sh
npm install --prefix "$SKILL_DIR"     # fetches web-tree-sitter + tree-sitter-wasms (~30 MB, gitignored)
```

Without the deps the script **degrades gracefully**: TS/C#/C++ still extract via regex; the other languages index as files with no class graph or edges (a log line points here). Coverage is verified end-to-end by `test/language-sweep.mjs` — run it after any extractor change; it must pass with zero failures (currently 96/96 across 12 languages; Swift's file-edge is `n/a` — Swift has no file-level import syntax). `test/accuracy.mjs` scores imports, refs, calls and symbols against hand-written ground truth (`test/accuracy-fixtures.mjs`) and fails when a score drops below `test/accuracy-baseline.json`; `--verbose` lists misses, `--update-baseline` records new scores. The `web-tree-sitter` pin is `~0.25` deliberately: 0.26+ dropped the grammar ABI that `tree-sitter-wasms@0.1.13` ships, and 0.24− is CommonJS-only.

The script honors `$CLAUDE_PROJECT_DIR`, reads `.claude/codemap.config.md` (skip patterns, layers, auto-update toggle), clears `.claude/codemap.dirty` after a successful write, and prints the diff summary on stdout. Surface the diff summary to the user; do not paraphrase. If the script fails, the error message tells you which spec step it choked on — fix the input or extend the script.

**Tests a change reaches.** `node <skill-dir>/affected-tests.mjs [--base <ref>] [-- <file>...]` reads `## File deps` backwards from the changed files (default: uncommitted, untracked and `<base>...HEAD`) and prints the test files it reaches, each with its import path, plus changed source files no test reaches (`untested`). Static imports and `require` only, so it orders tests, never replaces the full run. Files committed after the codemap was written count as changed, so a stale map widens the list. `/execute` runs these tests first; `/review` uses `untested` for its tests metric.

**How a change moves the architecture.** `node <skill-dir>/arch-delta.mjs --base <ref> [--head <ref>] [--depth N]` builds the codemap at the merge base of the two refs and at the head (default HEAD) in temporary git worktrees (no hooks run; the project's `.claude/` is untouched) and compares them folder by folder (`--depth`, default 2 segments): new and removed folder links, changed import counts, new and broken cycles, new and gone folders, and exports added, removed or changed. Prints the JSON `architecture` object `/review` shows on its page, with a Mermaid diagram (new links green, removed red dashed). Changed exports carry their old and new code as a line diff (up to 40 lines each, 40 exports); added and removed ones, their declaration line. When no code file changed it skips the build.

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

## Modules

- `packages/*`
- `services/**/api`
- depth: 2

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
- `## Modules` — replaces sub-project detection. Backtick-quoted folder patterns (`*` one segment, `**` any, matched against the whole folder path from the root) name module folders, and `depth: N` makes every folder N levels deep a module. A file belongs to the deepest module folder holding it, else its top-level folder.
- `## Layers` — `<LayerName>: <module>, <module>, ...` per bullet. Module names as the codemap lists them (a top-level folder or a sub-project folder). Surfaces in the codemap's `## Layers` section and is consumed by `visualise-codemap` to cluster L1 nodes.
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
