# visualise-codemap: procedure spec

The contract the script implements. Read when output looks wrong or when changing the script.

## Procedure

### 1. Resolve project root, project name, vault path

- Project root and project name: identical resolution to `update-codemap` (README h1 → package.json name → csproj → directory name).
- Obsidian vault path: `<Vault>/Projects/<ProjectFolder>/Codemap/<project>-codemap.md`, where `<Vault>` = the `vaultRoot` config value (see "How to run"). Flat file; do not create subfolders.
- `<ProjectFolder>` inference reuses the PR-review rule. When in doubt between two candidates, ask the user once before writing.

### 2. Read and parse `.claude/codemap.md`

Parse the existing codemap structure:

- **Top-level groups** (`## <dir>/` headings) → module nodes, file lists, and Structure tree leaves.
- **File entries** under each group → file-graph nodes.
- **`exports:` lines** → Files-list children; the export list also drives class-diagram method emission when a file contains exactly one class.
- **`## Layers`** in `.claude/codemap.config.md` (not the codemap), if present → declared layer clustering for the Module map (overrides topological auto-layering).
- **`## Entry points`** section, if present → Module map highlighted nodes (`:::entry` class).
- **`## Dependencies`** section, if present → module-level adjacency for Module map edges. If absent, edges are synthesised from `## File deps` (counted per cross-module file→file edge).
- **`## File deps`** section, if present → file-level adjacency. Drives per-module File graphs and the module-edge fallback.
- **`## Class graph`** section, if present → class kind, namespace, extends, implements, attributes, fields. Drives per-module class diagrams and cross-module class relations.

If the codemap predates the extended format and lacks Layers / Entry points / Dependencies / File deps / Class graph, render what is available and add Notes lines surfacing each gap.

### 3. Compose the document

The output is a single technical document built from seven composed parts, in this order. Each part is independent — partial inputs degrade individual parts but don't block the rest.

**3a. Structure tree.** ASCII tree (in a plain code fence, not Mermaid) of top-level modules and their immediate subfolders. Each module line shows the file count; each subfolder line is annotated `— subfolder`. Modules and files matched by `## Visualize` `skip:` are excluded. The `./` and `.claude/` groups (if present) are dropped.

**3b. Module map.** One Mermaid `graph TB` (top-down) diagram, scope = whole project — upstream/entry layers at the top, leaf utilities at the bottom. Renderer hint (ELK by default) is emitted as a `%%{init: ...}%%` directive so Mermaid picks layered layout. A legend below the diagram explains the styling.

- Nodes: one per top-level directory, minus any matched by `## Visualize` `skip:`.
- Entry points: render with `:::entry` class (distinct fill).
- **Hubs:** the most-depended-on modules (top ~15% by inbound edge weight) render with a `:::hub` class so the architecture's load-bearing centres read at a glance.
- **Cycle nodes:** modules on a detected dependency cycle get a distinct red stroke, so a cycle reads visually, not only in the `### Cycles detected` text block.
- **Layers — declared OR auto.** `.claude/codemap.config.md` `## Layers` is the single source of declared layers (never the codemap itself). When present, it wins: modules are clustered by `subgraph <LayerName>` and any module not assigned to a declared layer goes into a synthetic `Unlayered` bucket. When absent, layers are derived topologically — a cycle-tolerant DFS post-order assigns each module `layer = 1 + max(layer of its dependencies)`, settling over at-most-N passes so cycles stabilise. Sources land in `Layer 0`, sinks high.
- Edges: from `## Dependencies`, weighted. If `## Dependencies` is missing, module-edges are synthesised by counting cross-module file→file edges from `## File deps`.
  - **Intra-layer edges are dropped.** They belong in the per-module File graphs.
  - **Bidirectional pairs (A→B and B→A) collapse to a single `A <--> B` edge.** Both halves are still flagged in a `### Cycles detected` block.
  - **Top-N filter per source:** the `l1-edge-cap` config (default 8) caps outgoing edges per node. Overflow renders as a single dashed `(+K more)` ghost node connected via a dotted edge.
  - **Weight labels:** every edge is labeled with its weight (`--> |<weight>|`) so the relation strength (number of cross-module import edges) reads directly, not as a bare arrow.

**3c. Modules.** One `### <module>/` section per visible top-level module, alphabetical. Each section contains:

- A short paragraph: `<N> files, <K> exported symbols, <C> declared types.`
- `#### File graph` — Mermaid `graph LR`, files clustered into `subgraph sub_<X>["<X>/"]` per immediate sub-folder. Files at the module root (no sub-folder) render outside any subgraph. Outbound edges to files in other modules render as `:::ghost` nodes labelled with the full target path so the boundary crossing is visible. Caps `l2-file-cap` (default 40, ranked by edge degree) and `l2-edge-cap` (default 80, intra-first then outbound) apply; each truncation appends a one-line italic note below the diagram.
- `#### Class diagram` (only when the module contains classes from `## Class graph`) — Mermaid `classDiagram` with one node per class. Class bodies show: stereotype (`<<interface>>` / `<<enumeration>>` / `<<struct>>` / `<<record>>` / `<<abstract>>` — abstract inferred from `attributes:` containing the word "abstract" or `extends:` starting with `Abstract`), up to 8 fields (deduped by name), and up to `class-method-cap` (default 6) method-shaped exports — but method extraction only fires when the file contains exactly one class, to avoid misattributing exports across siblings. Relations: `<|--` for `extends`, `<|..` for `implements`, `o--` for composition when a field's type matches another in-scope class. Edges are only emitted when **both** endpoints are in the module; cross-module relations are deferred to the Cross-module section.
- `#### Files` — flat list, one line per file with its purpose, with nested bullets for each export from the codemap. When the source codemap lists names only (`exports: foo, bar`), reproduce names only — never invent signatures.

**3d. Cross-module class relations.** Optional. A single Mermaid `classDiagram` covering only `extends`/`implements` edges whose parent class lives in a different module than the child. Each rendered class node carries its module name as a synthetic field so it's clear which side of the boundary it belongs to. Section is omitted entirely when no such edges exist.

**3e. Call graph.** Optional, from `## Call graph`. Per-module Mermaid `graph LR` of caller → callee edges, ranked project-internal-first with a per-module cap. Callees that the codemap resolved (TypeScript / C#) render as `Type.method` nodes; unresolved callees render as the bare name (syntactic fallback). The legend states whether any edges are type-resolved. Omitted when the codemap has no `## Call graph`.

**3f. Sequence diagrams.** Optional, from `## Call sequence`. A small set of Mermaid `sequenceDiagram`s for the highest-signal entry points (ranked by distinct project-internal callees), each expanding the ordered call chain. Builtin/stdlib noise is filtered to project symbols. Every diagram carries a caption that it is **static call-structure order, not a runtime execution trace** (no conditionals/loops/await timing). Omitted when the codemap has no `## Call sequence`.

**3g. Notes.** Caveats from earlier steps: missing `## Dependencies`, missing `## File deps`, no `## Layers` (auto-layering used), no `## Entry points`, modules hidden by `skip:` patterns, etc. The script appends a line per condition so the user sees what's missing without re-running anything.

### 4. Mermaid templates

**Module map (3b):**

```mermaid
%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%
graph TB
  classDef entry fill:#fef3c7,stroke:#d97706,stroke-width:2px
  classDef overflow fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray: 4 2

  subgraph layer_0["Layer 0"]
    domain["domain/"]
  end
  subgraph layer_1["Layer 1"]
    services["services/"]
  end
  subgraph layer_2["Layer 2"]
    app["app/"]:::entry
  end

  app -->|7| services
  services --> domain
  services <--> domain_shared
  services_more["(+3 more)"]:::overflow
  services -.-> services_more
```

**File graph (3c):**

```mermaid
%%{init: {"flowchart": {"defaultRenderer": "elk"}}}%%
graph LR
  classDef ghost fill:#f9fafb,stroke:#d1d5db,stroke-dasharray: 4 2,color:#6b7280

  subgraph sub_routes["routes/"]
    app_routes_index_ts["index.ts"]
    app_routes_health_ts["health.ts"]
  end
  app_main_ts["main.ts"]
  app_bootstrap_ts["bootstrap.ts"]
  ghost_lib_logger_ts["lib/logger.ts"]:::ghost

  app_main_ts --> app_bootstrap_ts
  app_main_ts --> app_routes_index_ts
  app_routes_index_ts --> app_routes_health_ts
  app_main_ts --> ghost_lib_logger_ts
```

**Class diagram (3c, 3d):**

```mermaid
classDiagram
  class Repository {
    <<interface>>
    +find(id) Entity
    +save(e) void
  }
  class SqlRepository {
    +Db db
    +find(id) Entity
    +save(e) void
  }
  class CachedRepository {
    +Repository inner
    +Cache cache
  }
  Repository <|.. SqlRepository : implements
  Repository <|.. CachedRepository : implements
  CachedRepository o-- Repository
```

### 5. Output file structure

Single in-repo artifact, this exact shape:

```markdown
# Codemap — <project-name>
Last rendered: <YYYY-MM-DD>
Source: `.claude/codemap.md` (last updated: <date from source>)

## Structure

<code-fenced ASCII tree>

## Module map

<mermaid block>

(optional `### Cycles detected` block)

## Modules

### <module>/

<short paragraph>

#### File graph
<mermaid block>

#### Class diagram        (omitted when module has no classes)
<mermaid block>

#### Files
- `<rel>` — <purpose>
  - <export>

(repeats per module, alphabetical)

## Cross-module class relations    (omitted when no cross-module class edges)

<mermaid block>

## Call graph                      (omitted when the codemap has no `## Call graph`)

<mermaid block per module>

## Sequence diagrams               (omitted when the codemap has no `## Call sequence`)

<mermaid block per entry point>

## Notes

- <caveats>
```

### 6. Write artifacts atomically

These are derived artefacts (rendered from the source codemap, not authored content), so the writes are **announced before overwriting** but intentionally not propose-confirm-gated — a confirm on every render would be ceremony.

**In-repo artifact (always single-file):**
- `<root>/.claude/codemap.diagrams.md`. Overwrite. Create `.claude/` if missing.
- One file because this artifact is for AI consumption and GitHub rendering — both prefer a single scrollable file.

**Vault artifact (layout depends on `split-per-module`):**

*Single-file mode* (`split-per-module: false`) — historical layout, preserved for opt-out:
- `<Vault>/Projects/<ProjectFolder>/Codemap/<project-slug>-codemap.md`. Overwrite. Create `Codemap/` if missing.
- Identical to the in-repo copy plus YAML frontmatter.

*Per-module mode* (`split-per-module: true`, default) — recommended for projects with > ~10 modules:
- Index note: `<Vault>/Projects/<ProjectFolder>/Codemap/<project-slug>-codemap.md`. Contains YAML frontmatter, the Structure tree, the Module map, a `## Modules` section with Obsidian wikilinks (`[[<project-slug>/<module-slug>|<module>/]]`) and per-module stats (file count, type count, intra-edge count, outbound count), the Cross-module class relations diagram when present, and the Notes section.
- Module notes: `<Vault>/Projects/<ProjectFolder>/Codemap/<project-slug>/<module-slug>.md`, one per module. Each contains YAML frontmatter, a back-link to the index, and the module's full section (short paragraph + File graph + Class diagram when present + Files list). Obsidian renders one Mermaid diagram per note — far faster than rendering ~40 diagrams in one note on large projects.

Frontmatter (both modes):

```yaml
---
project: <project-name>
repo: <repo path>
source: .claude/codemap.md
rendered: <YYYY-MM-DD>
---
```

**Vault write allowlist:** the vault path must be allowlisted in `~/.claude/hook-config.json` under `outsideProjectWriteBlocker.allow`. The existing `Code Reviews/` allowlist does not cover `Codemap/`. On first run, if the write is blocked, surface the exact line to add:

```
Add to ~/.claude/hook-config.json → outsideProjectWriteBlocker.allow:
  "<vaultRoot>/Projects/*/Codemap/**"
```

(Substitute the actual `vaultRoot` config value when surfacing the line to the user — e.g. `<vaultRoot>/Projects/*/Codemap/**` becomes the user's configured vault path.)

Do not edit `hook-config.json` from this skill. The user owns hook-config edits.

### Notes hints

The `## Notes` section at the bottom of the rendered file is not just for caveats — it surfaces what's missing so a flat / edgeless document isn't silent. The script appends a line per condition:

- Both `## Dependencies` and `## File deps` missing → `Module map has no edges — source codemap has no ## Dependencies and no ## File deps to synthesise from. Re-run update-codemap.`
- All file-deps are intra-module → `Module map has no edges — all file-level dependencies are intra-module (no cross-module imports detected).`
- No `## Layers` declared → `Module map auto-layered topologically — no ## Layers declared in .claude/codemap.config.md.`
- Missing `## Entry points` → `Module map has no entry-point highlighting — no ## Entry points in source codemap.`
- Modules hidden by `## Visualize` `skip:` → `L1: N module(s) hidden by ## Visualize skip: <list>.`

These hints surface the diagnostic information at the bottom of the rendered file, so the user can act without re-running anything to inspect intermediate state.

### 7. Report

Print:

```
Wrote .claude/codemap.diagrams.md
Wrote <Vault>/Projects/<ProjectFolder>/Codemap/<project>-codemap.md (+ N module notes)
Source codemap age: X days
```

If the source codemap is older than 7 days, append:
```
Source codemap is X days old. Consider /update-codemap before re-rendering.
```

If `.claude/codemap.dirty` exists, append:
```
Source codemap is marked dirty (auto-update flag). Run /update-codemap first.
```
