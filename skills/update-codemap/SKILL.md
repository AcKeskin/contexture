---
name: update-codemap
description: Regenerate the project codemap at .claude/codemap.md — produce an LLM-facing architecture document with prose overview, per-module roles, detected conventions, hub files, and structured file/class graphs for downstream visualization. Use when the user types /update-codemap or asks to refresh / create / update the codemap for the current project.
---

# update-codemap

Generates an LLM-facing architecture document for the current project: a prose Overview, per-module roles (Role / Purpose / Entry / Public surface / Depends on / Imported by / Internals), evidence-based detected conventions, hub files ranked by importer count, and structured file-level + class-level graphs that downstream tools (notably `codemap-visualize`) consume to render diagrams and UML. Full-rewrite each run. Per-project, lives in the project's own git repo at `.claude/codemap.md`. The audience is LLMs and agents (consumed by `/prep`, `/discover`, and any agent that needs architectural context) — prose-heavy at the top, structured sections below.

## How to run (for Claude Code)

This skill is implemented as a standalone Node script — [`codemap.mjs`](./codemap.mjs), co-located in this skill folder — so the same engine drives both Claude Code and Copilot ([.github/prompts/update-codemap.prompt.md](../../.github/prompts/update-codemap.prompt.md)). The procedure below is the contract the script implements; treat it as the spec.

Resolve the script **relative to this SKILL.md's real location**, never relative to CWD and never via a hardcoded path — the skill is symlinked into `~/.claude/skills/` on each machine, so CWD-relative and home-relative paths break. Follow the symlink with `realpath`, then run the co-located script:

```sh
# device-agnostic: resolve the skill's real dir (collapses the ~/.claude symlink), run the co-located script
SKILL_DIR="$(dirname "$(realpath "$0")")"   # $0 = this SKILL.md's path as invoked
node "$SKILL_DIR/codemap.mjs"               # writes .claude/codemap.md
node "$SKILL_DIR/codemap.mjs" --dry-run     # preview to stdout, no write
node "$SKILL_DIR/codemap.mjs" --root <dir>  # explicit project root
```

If `realpath` is unavailable (rare on Windows shells), the script also lives at the canonical `contexture/skills/update-codemap/codemap.mjs`; run it with an explicit `--root .` against the target project.

### Multi-language extraction (tree-sitter)

Class graph, exports, and import edges for **Python, Java, Kotlin, Swift, Rust, Go, and C++** come from tree-sitter (AST), via the optional deps in this skill's `package.json`. One-time install, from the skill folder:

```sh
npm install --prefix "$SKILL_DIR"     # fetches web-tree-sitter + tree-sitter-wasms (~30 MB, gitignored)
```

Without the deps the script **degrades gracefully**: TS/C#/C++ still extract via regex; the other languages index as files with no class graph or edges (a log line points here). TypeScript and C# always use the regex extractors (mature, no AST needed). Coverage is verified end-to-end by `test/language-sweep.mjs` — run it after any extractor change; it must stay at 45/45 (Swift's file-edge is `n/a` — Swift has no file-level import syntax). The `web-tree-sitter` pin is `~0.25` deliberately: 0.26+ dropped the grammar ABI that `tree-sitter-wasms@0.1.13` ships, and 0.24− is CommonJS-only.

The script honors `$CLAUDE_PROJECT_DIR`, reads `.claude/codemap.config.md` (skip patterns, layers, auto-update toggle), clears `.claude/codemap.dirty` after a successful write, and prints the diff summary on stdout. Surface the diff summary to the user; do not paraphrase. If the script fails, the error message tells you which spec step it choked on — fix the input or extend the script.

## Procedure (the spec the script implements)

## When to run

- User types `/update-codemap`.
- User asks to refresh / create / update the codemap.
- Do **not** auto-fire. User owns freshness.
- Codemap is a map, not the territory. This skill does not replace reading the actual code when implementation details matter.

## Inputs

1. **Project root.** `$CLAUDE_PROJECT_DIR` if set, otherwise the current working directory. Resolve to an absolute path; write `.claude/codemap.md` relative to that.
2. **Previous codemap**, if present at `<root>/.claude/codemap.md`. Used for the diff summary at the end. Never used as input to what to scan — always scan from the filesystem.
3. **Dirty sentinel**, if present at `<root>/.claude/codemap.dirty`. Indicates the codemap-dirty hook flagged the codemap stale since the last run. Acknowledge in the report and delete the sentinel after a successful write.

## Procedure

### 1. Resolve project root and project name

Use `$CLAUDE_PROJECT_DIR` or cwd. Project name comes from:
1. First `# ` heading in a root-level `README.md`, if present.
2. Else `"name"` in root-level `package.json`, if present.
3. Else `<AssemblyName>` in any root-level `*.csproj`, if present.
4. Else the directory name.

Strip quotes, trim whitespace. If the result is empty, fall back to the directory name.

### 2. Build the file list (Glob + skip rules)

Glob `**/*` from project root. Apply skip rules to produce the **included** set.

**Skip directories outright (do not descend):**
- `node_modules/`, `bower_components/`
- `vendor/`, `third_party/`
- `dist/`, `build/`, `out/`, `target/`, `bin/`, `obj/`
- `.git/`, `.svn/`, `.hg/`
- `.idea/`, `.vscode/`, `.vs/`
- `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`
- `coverage/`, `.nyc_output/`
- `.next/`, `.nuxt/`, `.svelte-kit/`

**Skip files:**
- `*.lock`, `*.log`, `*.min.*`, `*.map`
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`
- Files with `@generated`, `DO NOT EDIT`, or `// <auto-generated>` in the first 10 lines.
- Files matching generated-name patterns: `*.g.cs`, `*.generated.*`, `*.designer.cs`.
- OS junk: `Thumbs.db`, `.DS_Store`, `desktop.ini`, empty-name artifacts like `nul`.
- Trivial config: `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierrc*`, `.eslintrc*`.
- Submodule/worktree pointer files: `.git`, `.svn`, `.hg` when they appear as regular files (e.g. inside a git submodule) rather than directories.

**Keep everything else**, including:
- Source code files (all supported languages).
- Test files — they count as project structure.
- `package.json`, `tsconfig.json`, `*.csproj`, `CMakeLists.txt`, `Makefile`, `build.gradle`, `pyproject.toml` — these carry structure.
- `README.md`, `LICENSE`, `CHANGELOG*`.
- The existing `.claude/codemap.md` and any other `.claude/*` files the project maintains.

When unsure, **include**. Over-inclusion costs tokens at discovery time but prevents hallucination. Under-inclusion silently re-introduces the problem.

**Per-project skip config (additive):**

Before applying the skip rules above, look for `<root>/.claude/codemap.config.md`. If present, parse its `## Skip` section and merge those patterns into the skip set for this run. Defaults always apply; the config can only add.

Parsing rules:
- The file is markdown. Find the heading `## Skip` (exact match, case-sensitive).
- Under that heading, collect every bullet line of the form `` - `<pattern>` `` (a hyphen, a space, a backtick-quoted glob). The pattern is the text between the backticks.
- Stop collecting when the next `##` heading or end-of-file is reached.
- Patterns are gitignore-style globs: trailing `/` matches a directory, `*` is a single segment glob, `**` crosses segments, leading `**/` matches at any depth.
- A pattern that fails to parse (no closing backtick, empty between backticks) is skipped with a warning. Record the line number and the malformed text for the diff summary; do not abort.
- Headings other than `## Skip` are ignored. Reserved for future use.
- File absent, file empty, or no `## Skip` section present → no-op, behave exactly as if no config existed.

The merge is set union: `effective_skip = default_skip ∪ config_skip`. The config never removes a default; if a default is genuinely wrong, fix the default in this skill.

### 3. Partition by language

Classify each included file by extension. Languages marked **(AST)** route through tree-sitter (`treesitter.mjs`) for class graph + exports + import edges when the optional deps are installed, else fall back as noted:

- **C++ headers/impl** (AST): `.h`, `.hpp`, `.hxx`, `.hh`, `.cpp`, `.cc`, `.cxx` → classes, fields, includes. Regex fallback (headers only) when AST unavailable.
- **C#**: `.cs` → regex extractor (mature; not routed through AST).
- **TypeScript/JavaScript**: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` → regex extractor (not routed through AST).
- **Python** (AST): `.py` → classes, `self.` fields, `import`/`from` edges. Imports-only fallback.
- **Java** (AST): `.java`. **Kotlin** (AST): `.kt`, `.kts` (grammar is best-effort — see risks). **Swift** (AST): `.swift` (no file-level import syntax → no file edges). **Rust** (AST): `.rs` → struct/trait + `impl Trait for T` → implements. **Go** (AST): `.go` → struct/interface, embedding → implements, package-path edges.
- **Web presentation**: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less` → tree + purpose, no exports.
- **Markdown**: `.md`, `.mdx` → tree + purpose, no exports.
- **Everything else**: tree + purpose, no exports.

AST languages read the **full file** (not the head-cap) so declarations past the cap aren't missed; regex languages keep the 80/200-line head cap below.

### 4. Extract per-file data

For each included file:

- **Read cap**: read the first 80 lines. If exports clearly extend past line 80 (rare), bump to 200 lines for that file. If still clipped, include the file in the codemap with purpose line and add `exports: <partial — extend read cap>` — do not silently truncate.
- **Purpose line**: derive from
  1. First top-of-file docblock / comment block, single-lined and trimmed to ≤ 100 chars.
  2. Else inferred from filename + top declarations. Active voice. No trailing punctuation.
- **Exports**: extract per language rules (§5).

### 5. Per-language extraction rules

**C++ (headers only):**
- Scan for `class`, `struct`, free function declarations, `typedef`, `using`, `enum`, `enum class`.
- Note the enclosing `namespace` per declaration (e.g. `Foo::Bar::Baz`).
- Skip anything inside `private:` sections where visible; `public:` and default-struct-public declarations count.
- Template declarations: list the primary template, not specializations.

**C#:**
- Scan `.cs` files for `public` types: `class`, `struct`, `interface`, `enum`, `record`.
- For each public type, list its `public` methods and `public` properties.
- Skip `internal`, `private`, `protected`. They are not part of the file's external contract.
- Note the enclosing `namespace` per type.

**TypeScript/JavaScript:**
- Scan for top-level `export` declarations: functions, classes, types, interfaces, enums, `const`, `let`, `var`.
- `export default ...` is listed separately, prefixed `default: `.
- `export { A, B as C }` forms: list `A`, `C`.
- `export * from './x'` re-exports: list as `re-exports from ./x`.
- JSX/TSX: no special handling beyond the above — components are just exported functions/classes.

**Signatures (all languages with exports):**
- Append a one-line signature to each export when extractable: `name — <signature>`.
- C#: method/property signatures from the declaration line (`public Task<Foo> DoThing(int n)` → `DoThing(int n): Task<Foo>`).
- C++ headers: free-function declarations include their parameter list and return type as written.
- TS/JS: pull the signature from the declaration line (`export function foo(x: number): Promise<void>` → `foo(x: number): Promise<void>`). For `export const`, include the type annotation if present.
- When the signature would exceed 120 chars, truncate and append `…`. When ambiguous (overloads, generic constraints spanning multiple lines beyond the read cap), omit the signature — never invent.

**Web presentation and markdown:**
- No exports section.
- Purpose line must identify role (e.g. "app shell layout", "theme variables", "getting-started guide").

**Ambiguity protocol:**
- When a pattern is uncertain (template specialization, partial class, dynamic re-export), note the uncertainty on the purpose line and list only exports you can confirm. Do not invent.

### 6. Assemble the output

The output is structured for LLM consumption: prose-heavy header first (Overview, Modules, Conventions detected, Hubs), then the structured sections (Entry points, Layers, Dependencies, File deps, Class graph), then per-module file groups. The visualize tool keys on the structured sections by name and on `## <name>/` group headings; everything else is benign noise.

Template (exact, sections present only when they have content):

```markdown
# Architecture — <project-name>
Last updated: <YYYY-MM-DD in UTC>

## Overview
<prose paragraph: README h1 first-para or package.json description, plus entry hint and dominant language>

## Modules
### <module>/
**Role:** <hardcoded role for well-known module names, else top-file purpose or humanized folder name>
**Purpose:** <2-3 most-imported files' purposes, concatenated>
**Entry:** `<entry-point file in this module, when detected>`
**Public surface:** `<name>`, `<name>`, … (up to 10, ranked by inbound file edges)
**Depends on:** <module>, <module>
**Imported by:** <module>, <module>
**Internals:**
- <module>/<sub>/ — <sub-folder purpose, only sub-folders with ≥2 files>

## Conventions detected
- <Convention name>: <N> instances — <detail with up to 3 example class names>

## Hubs
- `<file>` — <N> importers, role: <purpose>

## Entry points
- `<path>` — <one-line role>

## Layers
- <LayerName>: <module>, <module>

## Dependencies
- <module> → <module> (<weight>), <module> (<weight>)

## File deps
- `<source-file>` → `<target-file>`, `<target-file>`

## Class graph
- <kind>: `<ClassName>` in `<file>`
  namespace: <ns>
  extends: <Base> ; <Base>
  implements: <Iface> ; <Iface>
  attributes: <Attr> ; <Attr>
  fields: <name>: <Type> ; <name>: <Type>

## <top-level-dir>/
- `<path/relative/to/root>` — <purpose line>
  exports: <list separated by ` ; ` (with optional signatures)>
- `<path>` — <purpose line>
```

**Overview section** — prose paragraph:
- First sentence pulled from the root `README.md` H1's first paragraph if present; otherwise the root `package.json` `description`; otherwise a one-liner from the project name.
- Append `Entry: <up to 2 entry points>` when entry points are detected.
- Append `Dominant language: <lang>` based on the most common LANG_BY_EXT classification across all included files.
- Always emit the section. Never omit it.

**Modules section** — one `### <module>/` block per top-level directory, in alphabetical order. Each block populates the fields it can detect; missing fields are simply omitted:
- **Role** — hardcoded mapping for well-known module names (`server/`, `unity-package/`, `src/`, `lib/`, `app/`, `apps/`, `packages/`, `scripts/`, `tools/`, `tests/`, `test/`, `docs/`, `skills/`, `agents/`, `hooks/`, `mcps/`, `.github/`). Falls back to the highest-inbound-edge file's purpose, then to a humanized folder name. Always present.
- **Purpose** — the 2-3 most-imported files' purpose lines, concatenated, deduplicated.
- **Entry** — module's own entry point (matching by top-level dir against the detected entry list), else `index.ts` / `index.js` / `index.mjs` / `Boot.cs` / `Main.cs` / `Program.cs` at module root.
- **Public surface** — up to 10 export names from the top-ranked files (by inbound edges), 3 names per file max. Signatures stripped; `default: foo` becomes `foo`.
- **Depends on** — alphabetical list of other modules this module imports from (from `## Dependencies`).
- **Imported by** — alphabetical inverse of `Depends on`.
- **Internals** — bullets per sub-folder with ≥2 files inside this module, labeled with the top inbound file's purpose (or `N files` when no purpose is available).

**Conventions detected section** — evidence-based, never inferred. A convention fires only when **≥3 distinct classes** share the same explicit marker:
- `Implements <Interface>` — three or more classes implement the same interface name.
- `Extends <Base>` — three or more classes extend the same base (excluding `Error`, `Exception`, `object`).
- `Carries [<Attribute>] attribute` — three or more classes carry the same attribute (C# only).
- Detection runs over `## Class graph` data. No heuristic / fuzzy inference — if there are fewer than 3 explicit hits, no convention is reported. Sorted by instance count descending, then name ascending. Omit the section entirely if no convention reaches the threshold.

**Hubs section** — files with ≥3 inbound file-level edges, sorted by importer count descending then file path ascending. Format: `` `<file>` — <N> importers, role: <purpose> ``. Omit when no file crosses the threshold.

**Entry points section** — detect from:
- Root `package.json` `main` / `bin` / `module` fields.
- Root `pyproject.toml` `[project.scripts]`.
- `Program.cs` / `Main.cs` / files containing `static void Main` or `static int Main`.
- Root `*.csproj` `<StartupObject>` element.
- `CMakeLists.txt` `add_executable` targets.
- Single-page-app conventions: `src/main.{ts,tsx,js,jsx}`, `src/index.{ts,tsx,js,jsx}` when no explicit `main` field exists.
- Omit the section entirely if no entry points are detected. Do not invent.

**Layers section** — detect when `.claude/architecture.md` or `.claude/codemap.config.md` declares them (see config format below). Otherwise omit. Inference from folder names alone is too brittle.

**Dependencies section** — adjacency list, module-level, weighted:
- For each top-level directory, collect all import targets from files inside it.
- An import target is a file path or package name pulled from regex matches:
  - TS/JS: `import ... from '<target>'`, `import('<target>')`, `require('<target>')`.
  - C#: `using <namespace>;` (map namespace prefix to module by best-effort folder match).
  - C++: both `#include "<path>"` and `#include <path>`. Angle-bracket includes are matched against the in-tree file list — if the basename / suffix resolves to a file in the project, the edge counts. Otherwise the include is external and dropped.
  - Python: `import <module>`, `from <module> import ...`.
- Resolve each target in three steps: relative path → repo-relative path or top-level segment → basename lookup against the in-tree file index (prefers same-module on collision). Bare-name C++ includes (`#include "openxr_core.h"`) resolve via the basename step.
- Weight each edge by the number of distinct (source-file, target-file) pairs that resolved to it. Rendered as `<target> (<weight>)`.
- Drop module-level self-edges (`auth → auth`); intra-module file-to-file edges still appear in `## File deps`.
- Sort targets per source by weight desc, then name asc.
- If no imports are detected (e.g. a docs-only repo), omit the section.

**File deps section** — file-level adjacency list, both intra-module and inter-module:
- Every resolved import that maps to an in-tree file produces one entry.
- Format: `` - `<source-rel>` → `<target-rel>`, `<target-rel>` ``.
- Source-relative paths, alphabetical by source. Targets alphabetical within each source.
- Used by `codemap-visualize` to draw L2 file→file edges. Without this section, L2 graphs are nodes-only.
- Omit if no file-level edges resolve.

**Class graph section** — class-level data extracted from TS/JS, C#, and C++ headers. One block per class, in (file, name) alphabetical order:
- Header line: `` - <kind>: `<ClassName>` in `<file>` `` where `<kind>` is `class` / `interface` / `struct` / `record` / `enum`. The parser keys off this prefix.
- Sub-lines (indented two spaces) — each starts with a stable keyword and a colon. Emitted only when non-empty:
  - `namespace: <ns>` (C# only).
  - `extends: <Base> ; <Base>` — base class(es). C# applies the `I[A-Z]` heuristic to split the inheritance list; C++ surfaces the whole list as extends (no language-level distinction).
  - `implements: <Iface> ; <Iface>` — interface list (TS, C#).
  - `attributes: <Attr> ; <Attr>` — attribute identifiers preceding the type declaration (C#).
  - `fields: <name>: <Type> ; <name>: <Type>` — public fields / auto-properties. Type references are normalized (`Func<Task<T>>` → `Func`).
- Separator inside multi-value lines is ` ; ` (space-semicolon-space), because parameter / generic / tuple syntax contains commas. `codemap-visualize` splits on the same token to render UML class diagrams.
- Omit the section when no classes are extracted.
- Drives both `## Conventions detected` (same run) and `codemap-visualize`'s UML output (downstream).

**Ordering rules (mandatory):**
- Section order in the file: `# Architecture` header, then `## Overview`, `## Modules`, `## Conventions detected`, `## Hubs`, `## Entry points`, `## Layers`, `## Dependencies`, `## File deps`, `## Class graph`, then the per-module `## <top-level-dir>/` groups. Sections with no content are omitted (except Overview and Modules, which are always emitted when any file exists).
- `### <module>/` blocks inside `## Modules` in alphabetical order by directory name.
- Top-level file groups in alphabetical order by directory name.
- Files within a group in alphabetical order by relative path.
- A group per top-level directory. Root-level files (e.g. `README.md`, `package.json`) go in a leading group named `./` (root).
- Exports listed in source order of appearance within each file. Stable order matters for diffs.

**Formatting rules:**
- Purpose line ≤ 100 chars, no trailing period.
- `exports:` omitted when empty.
- `exports:` line indented with two spaces under its parent bullet.
- No blank lines between entries within a group. One blank line between groups.
- Last line of the file ends with a newline.

### 7. Write atomically

Write the full new content to `<root>/.claude/codemap.md`. Create `.claude/` if it does not exist. Announce the regeneration first (e.g. "Regenerating `.claude/codemap.md` — full rewrite of the derived map"), then overwrite without prompting. The overwrite is intentionally **not** propose-confirm-gated: this is a derived artefact (regenerated from the source tree, not authored content), so a confirm on every run would be ceremony. But the write is announced, never silent.

After a successful write, delete `<root>/.claude/codemap.dirty` if it exists. The sentinel's lifecycle is "marked stale by hook → cleared by this skill's next successful run".

### 8. Report diff summary

If a previous codemap existed, report:
- `+ N files added` (files present now that were not present before)
- `- M files removed` (files present before that are not present now)
- `~ K purpose lines changed`
- `~ L export lists changed`

If there was no previous codemap, report:
- `initial scan: N files, M with exports across X top-level groups`

If `.claude/codemap.config.md` was found and applied, add one line:
- `config applied: N skip patterns from .claude/codemap.config.md`

If `.claude/codemap.dirty` was present at start of run, add one line:
- `dirty sentinel cleared (last marked: <ISO timestamp from sentinel contents>)`

If parsing produced warnings, append a `warnings:` block listing each malformed line:
```
config applied: 3 skip patterns (1 malformed, ignored — see warnings below)
warnings:
  - line 12: pattern missing closing backtick: `Library
```

Do not dump the full diff — just the counts and a pointer to `git diff .claude/codemap.md` for specifics.

## What update-codemap does NOT do

- Does not delete `.claude/codemap.md` when the project is empty (reports an empty codemap and stops).
- Does not modify any file other than `.claude/codemap.md` and `.claude/codemap.dirty` (the latter is cleared after a successful write; `.claude/codemap.config.md` is read-only input).
- Does not render diagrams. Diagrams come from `codemap-visualize`, which consumes this skill's output.
- Does not commit to git. User owns the commit.
- Does not inspect or modify `.gitignore`. Users choose their sync mode (local-only / git-tracked / external); the skill is indifferent.
- Does not cross project boundaries (no traversing into sibling projects, no following symlinks out of the tree).
- Does not generate cross-references between files.

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
```

**Section reference:**

- `## Skip` — additive to defaults. Bullet list of backtick-quoted gitignore-style globs. See §2 parsing rules.
- `## Vendored` — bullet list of backtick-quoted gitignore-style globs. Files under these patterns are scanned for tree structure but get `<vendored>` as their purpose line and no `exports:` entry. Imports out of vendored files are not emitted into `## Dependencies` / `## File deps`. Use this for in-tree third-party SDKs (e.g. bundled OpenXR headers) that you want represented in the tree but not as part of the project's surface area. Imports *into* vendored files (e.g. project code that `#include`s a bundled header) still produce edges — vendored is about ownership of the file, not visibility.
- `## Layers` — `<LayerName>: <module>, <module>, ...` per bullet. Module names match top-level directories. Surfaces in the codemap's `## Layers` section and is consumed by `codemap-visualize` to cluster L1 nodes.
- `## Auto-update` — `enabled: true` (or `- enabled: true`) opts the project into the codemap-dirty hook. The hook touches `.claude/codemap.dirty` on any project-tree write so the next `/update-codemap` run knows the codemap is stale. Anything other than `enabled: true` (missing line, `enabled: false`, missing section) keeps the project opt-out — no sentinel is ever written. The hook is registered globally; this section is the per-project gate.

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

## Limits (v1)

- Pattern-matching, not parsing. Edge cases (template specializations, partial classes, dynamic `export default` expressions) may produce imperfect output. The ambiguity protocol (§5) says: note, do not invent.
- Read cap per file is practical, not semantic. If a real file surfaces where exports live past line 200, the proposal assumption needs revisiting.
- Full-rewrite each run. Incremental mode is future evolution, not v1.
- No subagent delegation. If main context strains on a huge repo, that is a signal to revisit — do not silently silence the symptom.
- Per-project config is skip-only. Force-include is a future extension, not v1.
