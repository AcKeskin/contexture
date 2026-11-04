---
name: visualise-codemap
description: "Render .claude/codemap.md into a UML-heavy document — layered module map, per-module class/file graphs, cross-module relations, call graphs, sequence diagrams — written to .claude/codemap.diagrams.md and the vault. Consumes the existing codemap, never rescans. Use on /visualise-codemap or \"diagram the codemap\"."
disable-model-invocation: true
---

# visualise-codemap

Reads `.claude/codemap.md` and emits a UML-heavy technical document: an ASCII Structure tree, a topologically layered **top-down Module map** (edges labeled with relation weight, most-depended-on modules highlighted as hubs, dependency cycles flagged, plus a legend), per-module sections (short paragraph + subfolder-clustered file graph + classDiagram + files list), a cross-module class relations diagram when relevant, per-module **call-graph** diagrams (TS/C# edges rendered type-resolved as `Type.method` where the codemap resolved them, bare-name syntactic fallback otherwise), and Mermaid **sequence diagrams** for a few high-signal entry points (static call-structure order, explicitly *not* a runtime trace). Writes one in-repo artifact (`.claude/codemap.diagrams.md`) for AI consumption and GitHub rendering, plus one Obsidian vault artifact for human reading.

The text codemap stays the source of truth. This skill produces a derived view; it never re-scans the filesystem.

## How to run (for Claude Code)

Implemented as a standalone Node script — [`visualise-codemap.mjs`](./visualise-codemap.mjs), co-located in this skill folder. The procedure below is the contract the script implements.

Run the script from this skill's folder, never relative to CWD or a hardcoded path. Claude Code fills in `${CLAUDE_SKILL_DIR}` below. In another tool it stays literal: use the folder this SKILL.md is in instead.

```sh
SKILL_DIR="${CLAUDE_SKILL_DIR}"
node "$SKILL_DIR/visualise-codemap.mjs"                           # writes .claude/codemap.diagrams.md
node "$SKILL_DIR/visualise-codemap.mjs" --dry-run                 # preview to stdout
node "$SKILL_DIR/visualise-codemap.mjs" --vault "<vault-root>"    # also write to Obsidian vault (per-module split by default)
node "$SKILL_DIR/visualise-codemap.mjs" --project-folder MyProduct   # override inferred ProjectFolder
```

Vault root (`<Vault>`) is read from machine-local config — `vaultRoot` in `~/.claude/hook-config.json` — **never hardcoded** (per `universal/no-hardcoded-machine-paths.md`). Pass it as `--vault "<vaultRoot>"`. If `vaultRoot` is unset, write only the in-repo artifact and surface *"Set `vaultRoot` in `~/.claude/hook-config.json` to also write the vault copy."* The script infers `<ProjectFolder>` by matching an existing `Projects/<Name>/` subfolder, else the project name; ships no owner-specific repo mapping. To alias several repos onto one folder, pass `--project-folder <name>`. On vault-write failure, the script prints the exact `outsideProjectWriteBlocker.allow` line to add.

Per-project tuning (caps, skip patterns, renderer, vault layout) lives under the `## Visualize` section of `.claude/codemap.config.md` — see the [Visualize config](#visualize-config) reference below.

## When to run

- User types `/visualise-codemap`.
- User asks to render / draw / diagram / visualize the codemap.
- Do **not** auto-fire.
- Do **not** chain after `update-codemap` — they compose by user invocation, not by call.

## Inputs

1. **Project root.** `$CLAUDE_PROJECT_DIR` if set, otherwise the current working directory.
2. **Source codemap.** `<root>/.claude/codemap.md`. Required. If missing, instruct the user to run `/update-codemap` first and stop.
3. **Module-level dependency adjacency.** Parsed from `## Dependencies`. Accepts both weighted (`bar/ (12)`) and legacy bare (`bar/`) forms; legacy entries are treated as weight 1. If absent, module-edges are synthesised from `## File deps` (every file→file edge whose endpoints live in different top-level modules contributes weight 1). Notes line surfaces the synthesis fallback if the section is missing.
4. **File-level dependency adjacency.** Parsed from `## File deps` (file→file edges, written by `update-codemap` from v2 onward). If absent, per-module file graphs render nodes only and a Notes line tells the user to re-run `/update-codemap` to enrich.
5. **Class graph.** Parsed from `## Class graph` — block-per-class with `kind: Name in path`, plus indented `namespace`, `extends`, `implements`, `attributes`, and `fields: name: Type ; name: Type` (using ` ; ` separator). Drives the per-module class diagrams and the cross-module class relations diagram. If absent, both class-diagram sections are omitted silently — no Notes line, since not every project has a meaningful OO surface.
6. **Per-project visualize config.** Parsed from `<root>/.claude/codemap.config.md` → `## Visualize` section. See the [Visualize config](#visualize-config) reference below.
7. **Obsidian vault path.** `<ProjectFolder>` matches an existing `Projects/<Name>/` subfolder, else derives from the project name (alias several repos onto one folder via `--project-folder`), else ask once.

## Procedure

`visualise-codemap.mjs` implements the procedure; you run it. The full spec (parsing `.claude/codemap.md`, composing the diagrams, Mermaid templates, the output layout, atomic writes, notes hints, the report) is in [spec.md](spec.md). Read it when output looks wrong or when changing the script.

## Visualize config

`.claude/codemap.config.md` `## Visualize` section. All keys optional; absent keys fall back to defaults.

```markdown
## Visualize

- skip: `vendor/**`
- skip: `**/__snapshots__/`
- l1-edge-cap: 8
- l2-file-cap: 40
- l2-edge-cap: 80
- class-method-cap: 6
- renderer: elk
- split-per-module: true
```

**Key reference:**

- `skip: <glob>` — gitignore-style glob. Modules and files matched are excluded from the Structure tree, Module map, per-module File graphs, Class diagrams, and Files lists. The source `codemap.md` is **not** modified; the file remains indexed for AI consumption. Use this to hide noise from diagrams without losing it from the textual codemap (e.g. third-party generated code that's already tagged `## Vendored` in the source codemap but still adds clutter to the diagrams). Multiple `skip:` bullets allowed.
- `l1-edge-cap: <int>` — top-N outgoing module edges per source on the Module map. Default `8`. Overflow renders as a single `(+K more)` dashed node.
- `l2-file-cap: <int>` — max files per module File graph. Default `40`. Files ranked by edge degree; overflow noted in italics below the diagram.
- `l2-edge-cap: <int>` — max edges per module File graph. Default `80`. Intra-module edges emitted first, then outbound.
- `class-method-cap: <int>` — max method-shaped exports rendered per class in Class diagrams. Default `6`. Only applies when the file contains exactly one class (otherwise methods would be misattributed across siblings). Fields are separately capped at 8 (not configurable).
- `renderer: elk | dagre` — Mermaid flowchart renderer. Default `elk`. ELK handles dense / layered graphs much better than dagre; switch to `dagre` only if your Mermaid environment lacks ELK support.
- `split-per-module: true | false` — vault output layout. Default `true`. See §6 above.

Glob semantics match the `## Skip` and `## Vendored` sections in `update-codemap` — same parser, same rules.

More in [reference.md](reference.md): What visualise-codemap does NOT do, limits (v1), relationship to other skills.
