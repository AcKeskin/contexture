---
name: visualise-codemap
description: "Render .claude/codemap.md into a UML-heavy document — layered module map, per-module class/file graphs, cross-module relations, call graphs, sequence diagrams — written to .claude/codemap.diagrams.md and the vault, plus a clickable map page (.claude/codemap.html). Consumes the existing codemap, never rescans. Use on /visualise-codemap or \"diagram the codemap\"."
disable-model-invocation: true
---

# visualise-codemap

Reads `.claude/codemap.md` and emits a UML-heavy technical document: an ASCII Structure tree, a topologically layered **top-down Module map** (edges labeled with relation weight, most-depended-on modules highlighted as hubs, dependency cycles flagged, plus a legend), per-module sections (short paragraph + subfolder-clustered file graph + classDiagram + files list), a cross-module class relations diagram when relevant, per-module **call-graph** diagrams (TS/C# edges rendered type-resolved as `Type.method` where the codemap resolved them, bare-name syntactic fallback otherwise), and Mermaid **sequence diagrams** for a few high-signal entry points (static call-structure order, explicitly *not* a runtime trace). Writes one in-repo artifact (`.claude/codemap.diagrams.md`) for AI consumption and GitHub rendering, plus one Obsidian vault artifact for human reading, plus `.claude/codemap.html`: a clickable map for people new to the code (see [Map page](#map-page)).

The text codemap stays the source of truth. This skill produces a derived view; it never re-scans the project. The map page reads the text of the files the codemap lists (for code snippets) and, with `--diff`, asks git what changed.

## How to run (for Claude Code)

Implemented as a standalone Node script — [`visualise-codemap.mjs`](./visualise-codemap.mjs), co-located in this skill folder. The procedure below is the contract the script implements.

Run the script from this skill's folder, never relative to CWD or a hardcoded path. Claude Code fills in `${CLAUDE_SKILL_DIR}` below. In another tool it stays literal: use the folder this SKILL.md is in instead.

```sh
SKILL_DIR="${CLAUDE_SKILL_DIR}"
node "$SKILL_DIR/visualise-codemap.mjs"                           # writes .claude/codemap.diagrams.md + .claude/codemap.html
node "$SKILL_DIR/visualise-codemap.mjs" --dry-run                 # preview to stdout
node "$SKILL_DIR/visualise-codemap.mjs" --vault "<vault-root>"    # also write to Obsidian vault (per-module split by default)
node "$SKILL_DIR/visualise-codemap.mjs" --project-folder MyProduct   # override inferred ProjectFolder
node "$SKILL_DIR/visualise-codemap.mjs" --diff main               # map page also marks what changed since main
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

## Map page

`.claude/codemap.html` is one self-contained file built from `.claude/codemap.json` (skipped when that file is missing; re-run `/update-codemap`). Open it in a browser. Not written on `--dry-run`.

- The graph shows one folder level at a time: its subfolders and files as boxes, import edges between them (dependents above what they depend on, back edges of a cycle in a second colour, references dashed). Single-child folder chains are merged. Over 40 boxes, the rest go into one "+N more" box.
- Click a box for details: a folder's entry points, most used files and the folders it uses and is used by; a file's purpose, symbols with line numbers, imports, importers, tests and references. Double-click a folder (or Open folder) to go inside; the breadcrumb and Back go up.
- Search finds files, symbols and purposes. Picking a result opens its folder and selects it.
- Open in editor links use `vscode://` (or `cursor://`, or none, picked on the page) with the project root from the run. The page is local: it holds an absolute path, so don't commit it (`.claude/` is usually gitignored).
- With `.claude/codemap.components.json` (see [Name components](#name-components)), a Folders | Components switch shows the same files grouped by component, with box bars coloured by layer and named links shown when you hover or pick a box.
- With `.claude/codemap.tour.json` (see [Guided tour](#guided-tour)), a Tour button walks the stops in order.
- Code: the page holds the text of the code files (changed files first, then entry points, then the most imported, up to `page-code-mb`, 3 MB by default; files over 200 KB are left out). Click a symbol name to see its code under it (from its line to its end, with the comments just above), or Show file for the whole file. Wider opens it full width. If a file changed after the codemap was built, the page says so and finds each symbol by name near its old line.
- `--diff <ref>` (a branch, tag or commit): changed lines since that ref, in the working tree, untracked files included. Changed files and folders get a dot in the graph, a band button lists the changed files and their changed symbols, and a file shows its changes (added lines green, removed lines red, 3 lines around) and tags its changed symbols. Without `--diff`, nothing about changes is shown.
- `## Visualize` `skip:` patterns apply. Zoom, pan and full screen come from design-proposal's `zoom.js`.

## Name components

Folders don't always match the architecture. Run this when they don't, or when the user asks for components:

1. `node "$SKILL_DIR/components.mjs" prompt` prints the folders (file counts and the purposes of their most used files) and the import links between them. It is compact, about 8k tokens on 1,100 files.
2. From that, group the folders into 4 to 12 components named for what they do, not for their folder. Each component gets a one-line `description`, a `layer` (`ui`, `api`, `service`, `data`, `infra`, `tooling`, `tests`, `docs`, `config`) and `paths`: folders ending in `/`, `./` for the files at the root, or single files. The longest matching path wins, so a broad folder can sit under a narrower one. For each link you can back from the purposes, add a short verb label (6 words at most). Don't add links you are guessing at.
3. Write `.claude/codemap.components.json`:
   ```json
   { "version": 1,
     "components": [{ "id": "review", "name": "Code review", "description": "…", "layer": "service", "paths": ["skills/review/"] }],
     "links": [{ "from": "review", "to": "codemap", "label": "reads the codemap" }] }
   ```
4. `node "$SKILL_DIR/components.mjs" check` lists files per component, files no path takes ("Other"), and problems (unknown layer or link, a path that matches nothing). Fix the problems. Keep Other small.
5. Run the script again. `codemap.diagrams.md` gets a `## Component map` (boxes coloured by layer; import links solid, the strongest reference-only links dashed, each labelled with your words, else its count). The map page gets a Folders | Components switch.

The file is not refreshed by `/update-codemap`. New files under a listed folder join its component, and anything else lands in Other until the file is edited.

## Guided tour

A short reading order for someone new to the code. Run it when the user asks for a tour or for onboarding.

1. `node "$SKILL_DIR/tour.mjs" draft [--stops N]` writes `.claude/codemap.tour.json` (12 stops by default, 20 at most) and prints it. With named components it makes one stop per component, starting from the entry side. Without them it starts at the entry points (or the files that look like entry points), then follows what they import, 3 files from each stop, most used first, and fills any stops left with the most used files. Tests and vendored files are left out. Each stop has a file, a line (the exported symbol that calls the most, else the first exported one), a title and a `why` made from the purpose line and import counts.
2. Read each stop's file around its line. Rewrite `why` in one or two plain sentences: what the file does and what to notice before the next stop. Drop a stop that teaches nothing, move one that reads better earlier, and fix `line` when a better place exists. Then set `"drafted": false`.
3. `node "$SKILL_DIR/tour.mjs" render [--codetour]` checks the stops (each file is in the codemap, the line is within it, every stop has a `why`) and writes `.claude/codemap.tour.md`. With `--codetour` it also writes `.tours/codemap.tour` for the VS Code CodeTour extension. Ask before writing it, because `.tours/` sits in the repo, not under `.claude/`.
4. Run the script again. The map page gets a Tour button: each stop opens its file in the graph and panel, with Previous, Next and the full list.

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
- page-code-mb: 3
```

**Key reference:**

- `skip: <glob>` — gitignore-style glob. Modules and files matched are excluded from the Structure tree, Module map, per-module File graphs, Class diagrams, and Files lists. The source `codemap.md` is **not** modified; the file remains indexed for AI consumption. Use this to hide noise from diagrams without losing it from the textual codemap (e.g. third-party generated code that's already tagged `## Vendored` in the source codemap but still adds clutter to the diagrams). Multiple `skip:` bullets allowed.
- `l1-edge-cap: <int>` — top-N outgoing module edges per source on the Module map. Default `8`. Overflow renders as a single `(+K more)` dashed node.
- `l2-file-cap: <int>` — max files per module File graph. Default `40`. Files ranked by edge degree; overflow noted in italics below the diagram.
- `l2-edge-cap: <int>` — max edges per module File graph. Default `80`. Intra-module edges emitted first, then outbound.
- `class-method-cap: <int>` — max method-shaped exports rendered per class in Class diagrams. Default `6`. Only applies when the file contains exactly one class (otherwise methods would be misattributed across siblings). Fields are separately capped at 8 (not configurable).
- `renderer: elk | dagre` — Mermaid flowchart renderer. Default `elk`. ELK handles dense / layered graphs much better than dagre; switch to `dagre` only if your Mermaid environment lacks ELK support.
- `split-per-module: true | false` — vault output layout. Default `true`. See §6 above.
- `page-code-mb: <number>` — file text held by the map page for code snippets. Default `3`. `0` leaves code out (smaller page, no snippets).

Glob semantics match the `## Skip` and `## Vendored` sections in `update-codemap` — same parser, same rules.

More in [reference.md](reference.md): What visualise-codemap does NOT do, limits (v1), relationship to other skills.
