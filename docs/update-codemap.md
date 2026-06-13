# Update codemap — project context generator

Implements. Authoritative procedure lives in [`skills/update-codemap/SKILL.md`](../skills/update-codemap/SKILL.md); this doc is the Claude-facing reference.

## What it does

Scans the current project, produces a file tree + one-line purpose + key exports map, writes it to `<project>/.claude/codemap.md`. Codemap lives per-project at a stable path; whether it travels between machines is the user's choice (see "Sync modes" below).

## When to invoke

- After meaningful structural changes: new modules, renames, significant refactor, new exports, files removed.
- When a project has no codemap yet.
- **Not** on every session, not on every commit. User owns freshness.

Invocation: `/update-codemap` or ask Claude to "refresh the codemap."

## Format summary

```markdown
# Codemap — <project-name>
Last updated: YYYY-MM-DD

## <top-level-dir>/
- `<path>` — <purpose line>
 exports: <list separated by `; `>
```

- Top-level groups alphabetical; files within groups alphabetical.
- `exports:` omitted when empty (HTML, CSS, markdown, files with no exports).
- Date in UTC, day granularity. Enough for "codemap age: N days" reporting in discover.

## What gets scanned vs skipped

**Scanned:** source code in supported languages, tests, project-structure config (`package.json`, `tsconfig.json`, `*.csproj`, `CMakeLists.txt`, `Makefile`, `build.gradle`, `pyproject.toml`), `README.md`, `LICENSE`, markdown docs.

**Skipped:** build artifacts (`dist/`, `build/`, `bin/`, `obj/`, `target/`), dependency dirs (`node_modules/`, `vendor/`), IDE dirs (`.idea/`, `.vscode/`), cache dirs, lock files, minified files, sourcemaps, generated files (`@generated`, `*.g.cs`, `*.generated.*`), trivial config (`.gitignore`, `.editorconfig`, `.prettierrc*`), OS junk (`Thumbs.db`, `.DS_Store`, `nul`).

When unsure → include. Over-inclusion costs tokens; under-inclusion silently re-introduces hallucination.

## Per-language extraction

Two extraction backends. **AST** languages are parsed by tree-sitter (`treesitter.mjs`, via the optional `web-tree-sitter` + `tree-sitter-wasms` deps) — uniform class graph (name / kind / extends / implements / fields), exports, and import edges. **Regex** languages use the hand-written extractors. TS and C# stay on regex (mature, no AST needed); the rest moved to AST to cover languages regex never reached.

| Language | Files scanned | Backend | Extracted | | --- | --- | --- | --- | | C++ | `.h`, `.hpp`, `.hxx`, `.hh`, `.cpp`, `.cc`, `.cxx` | AST (regex fallback, headers) | classes/structs, fields, base classes, includes | | C# | `.cs` | regex | `public` types + members, namespace, `using` → namespace file edges | | TS/JS | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | regex | top-level `export`s, `default:` separately, import edges | | Python | `.py` | AST | classes, `self.` fields, base classes, `import`/`from` edges | | Java | `.java` | AST | classes/interfaces, extends/implements, fields, package imports | | Kotlin | `.kt`, `.kts` | AST | classes/interfaces, inheritance, properties, imports — *grammar best-effort* | | Swift | `.swift` | AST | classes/structs/protocols, conformance, properties (no file-level imports) | | Rust | `.rs` | AST | structs/traits/enums, `impl Trait for T` → implements, fields, `use` edges | | Go | `.go` | AST | structs/interfaces, embedding → implements, fields, package imports | | HTML/CSS | `.html`, `.css`, `.scss`, etc. | — | none — tree + purpose | | Markdown | `.md`, `.mdx` | — | none — tree + purpose | | Everything else | — | — | tree + purpose only | **Optional deps.** Without `web-tree-sitter` + `tree-sitter-wasms` installed (`npm install` in `skills/update-codemap/`), the engine **degrades gracefully**: TS/C#/C++ still extract via regex, AST languages index as files with no class graph or edges, and a log line points to the install. `web-tree-sitter` is pinned `~0.25` — 0.26+ dropped the grammar ABI `tree-sitter-wasms@0.1.13` ships, and 0.24− is CommonJS-only.

**Verification.** `skills/update-codemap/test/language-sweep.mjs` runs the real `update-codemap → codemap-visualize` pipeline on a fixture per language and asserts class / relation / field / edge / valid-mermaid. Must stay 45/45 (Swift file-edge is `n/a` — no file-level import syntax). Baseline at `test/baseline.json`; non-zero exit on regression.

## Read cap

**Regex** languages: read the first 80 lines per file; bump to 200 only if exports clearly extend past 80; beyond 200 → include with `exports: <partial — extend read cap>` and stop. **AST** languages read the **full file** so declarations past the cap aren't missed (parsing is fast; I/O dominates). Protects against context exhaustion on large files without silently truncating.

## Sync modes

Codemap location is always `<project>/.claude/codemap.md`. Sync is the user's choice per project:

1. **Local-only (default).** Codemap stays on the machine that generated it. Each machine runs `/update-codemap` when it wants one. Matches the common convention of globally gitignoring `.claude/`. Drift across machines is expected and cheap to resolve with a fresh run.
2. **Per-project git-tracked.** Opt in for a specific project by adding an un-ignore rule in that project's local `.gitignore`. Example:
 ```
 # un-ignore the Claude codemap
 !.claude/
.claude/*
 !.claude/codemap.md
 ```
 Commits and diffs then become PR-visible.
3. **External sync.** An external tool handles syncing the file at the standard path. The skill is indifferent.

The skill never inspects `.gitignore`, never commits, never nudges toward a mode. Users own ignore and sync policy.

## Diff reporting

After regeneration the skill reports:
- `+ N files added / - M removed`
- `~ K purpose lines changed / ~ L export lists changed`

For the detailed diff: `git diff.claude/codemap.md` in the project.

## Consumed by

Discovery reads `.claude/codemap.md` if present, surfaces matched entries alongside memory fragments, and reports codemap age so Claude can judge trust level. If codemap is missing, discover proceeds with memory only and notes the absence.

## Debug

- `/update-codemap` doesn't run: confirm `~/.claude/commands/update-codemap.md` and `~/.claude/skills/update-codemap/SKILL.md` are linked (bootstrap should have done this per-item). Restart Claude Code if the command was added since session start.
- Generated codemap missing entries: check skip rules — the entry may be in a skipped directory (build output, node_modules, etc.). If it should be included, the skip rules need amending.
- Exports wrong or missing: pattern-matching has limits, see the ambiguity protocol in the SKILL. The purpose line should note uncertainty when Claude could not confirm an export.
- Codemap diffs noisy on regeneration without real changes: check that ordering rules (alphabetical by top-level group, then by path, exports in source order) are holding. Any drift there makes diffs meaningless.

## Limits (v1)

- Pattern-matching, not AST parsing. Edge cases produce imperfect output.
- Full rewrite every run. Incremental updates are future evolution.
- No auto-regeneration, no staleness-warning hook — user-triggered only.
- Single-project. Cross-project codemap discovery is future evolution.
