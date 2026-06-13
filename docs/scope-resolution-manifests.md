# Scope-resolution manifests

Implements the file-format half of +, realizing the `manifest-formats` module of the `scope-resolution` mechanism. This doc is the **authoritative format contract**; the `resolver`, `prep`/`discover` integration, and `boundary-observation` modules read these formats — they do not re-derive them.

This doc is **format only** — what the files look like, what their fields mean, what happens when they disagree or are absent. The longest-prefix walk, merge algebra, caching, and detection heuristic live in the `resolver` / `boundary-observation` specs, not here.

## What this owns

| Concern | This doc | Elsewhere | | --- | --- | --- | | The three file formats + field schemas | **owns** | — | | Precedence (registry vs manifest) | **owns** | — | | Graceful-degradation semantics | **owns** | — | | Parse / longest-prefix walk / merge algebra | — | `resolver` module | | When a boundary cross fires re-prep | — | `boundary-observation` module | | Detection heuristic (what = "different tech") | — | detection spec (forward-link below) | | Org-profile resolution | — | (deferred; seam below) | These are static markdown conventions read by skill-prose. No runtime engine, no validator binary.

## The three files

A polyglot or composite repo declares its discipline boundaries with three file types. The **registry** (one per repo) declares *what is a boundary*; the **boundary manifest** (one per registered submodule) declares *that boundary's identity*; the **filter manifest** (free-standing, anywhere) refines *which scope applies* within a region.

### File 1 — `<repo>/.claude/submodules.md` (registry, parent-owned)

A markdown document with a single `## Submodules` table. The table is the only machine-read part; prose and comments around it are ignored. A table — not frontmatter — because this is a one-to-many shape (a parent listing N children) that reads naturally as rows.

```markdown
# Submodules

Optional prose describing the repo's boundary layout.

## Submodules

| path | language | kind | rule-source | |------|----------|------|-------------| | services/api | go | logical | submodule | | services/ml | python | logical | parent | | apps/web | typescript | logical | submodule | | third_party/upstream-lib | — | vendored | none | ```

| column | type | required | default | meaning | |--------|------|----------|---------|---------| | `path` | string (repo-relative) | **required** | — | the boundary root. Trailing slash optional. Longest-prefix match against a task path selects it. | | `language` | string tag | optional | `—` (none) | primary language for scoping. A `submodule.md` may override. | | `kind` | enum `logical` \| `git` \| `vendored` | optional | `logical` | what the region IS (see kind semantics). | | `rule-source` | enum `submodule` \| `parent` \| `none` | optional | per-kind default | which corpus to load. | An empty cell or `—` means "unspecified — use default." Rows outside the `## Submodules` table are ignored.

### File 2 — `<registered-path>/.claude/submodule.md` (boundary manifest, submodule-owned)

YAML frontmatter + optional notes — matching the harness's manifest convention (architectural-rule, memory, vision). **Only meaningful at a path registered in the parent's `submodules.md`.** A `submodule.md` at an unregistered path is ignored (see Graceful degradation).

```markdown
---
# --- shared field-core (also valid in scope.md) ---
scopes: [api, http, postgres] # scope tags for discovery
relevance: [always] # relevance phases; optional
inherit-parent: true # merge with ancestor corpus?; optional
rule-source: submodule # corpus selection; optional, overrides registry
# --- submodule.md additions (boundary identity) ---
name: api-service # short slug for statusline/logs
language: go # overrides registry language
kind: logical # overrides registry kind; optional
---

# Submodule notes

Free-form. Anything Claude should know inside this submodule that isn't a
rule (architectural-rules) or a fact (memory).
```

### File 3 — `<dir>/.claude/scope.md` (filter manifest, free-standing)

YAML frontmatter + optional notes. **The free-standing refiner — works anywhere, registered or not.** Carries the shared field-core only; it does **not** carry `name` / `language` / `kind`. Declaring a different language is a *boundary* concern → that folder should be a registered submodule, not a `scope.md`.

```markdown
---
scopes: [internal, db, postgres] # merged into active scope set
relevance: [when-touching-db] # relevance phases; optional
inherit-parent: true # merge with ancestor scope?; optional
rule-source: parent # corpus selection; optional
---

# Folder notes

Free-form, as above.
```

## Shared field-core

Defined once; valid in both `submodule.md` and `scope.md`. (The single definition is deliberate — these four fields would otherwise be specified twice and drift.)

| field | type | required | default | meaning | |-------|------|----------|---------|---------| | `scopes` | list of tags | optional | `[]` | scope tags merged into the active filter when a task path is under this file's folder. Same vocabulary as architectural-rule `scope:`. | | `relevance` | list of phases | optional | inherited | relevance phases active under this folder. Same vocabulary as architectural-rule `relevance:`. | | `inherit-parent` | bool | optional | per-kind (see below) | `true` → merge with ancestor (submodule corpus / scope chain), last-write-wins by relative path. `false` → cut the chain; this file's values stand alone. | | `rule-source` | enum `submodule` \| `parent` \| `none` | optional | per-kind / `parent` | `submodule` → load own `<here>/.claude/architectural-rules/`. `parent` → use the enclosing corpus, pass this file's scopes. `none` → load no rules (out-of-discipline subtree). | ### `submodule.md`-only additions

| field | type | required | default | meaning | |-------|------|----------|---------|---------| | `name` | string slug | optional | path basename | short identifier for statusline / logs. | | `language` | string tag | optional | registry's `language` | primary language; **overrides** the registry entry. | | `kind` | enum | optional | registry's `kind` | **overrides** the registry entry. | ## kind semantics

`kind` and `rule-source` are **orthogonal axes that usually correlate.** `kind` describes *what the region is*; `rule-source` describes *which corpus to load*. They are kept separate because one does not fully imply the other — a `git` submodule might legitimately use parent rules.

| kind | meaning | default `rule-source` | default `inherit-parent` | |------|---------|----------------------|--------------------------| | `logical` | a polyglot region of this repo (a folder) | `parent` | `true` | | `git` | an actual git submodule (own `.git`, own remote) | `submodule` | `false` | | `vendored` | third-party code; no parent discipline applies | `none` | `false` | Defaults are **overridable**: a `vendored` entry may set `rule-source: parent` if the user really wants parent rules applied. The defaults encode the common case, not a constraint.

## Precedence — existence vs properties

Two different facts, two different authorities — so "manifest overrides registry" and "registry authoritative" do not conflict:

- **Existence** (is this path a boundary?) → **the registry is authoritative.** A `submodule.md` at an unregistered path is ignored. Detection (forward-link below) resolves to *writing a registry row*, never to treating an unregistered file as authoritative.
- **Properties** (this boundary's language / kind / rule-source / scopes) → **the `submodule.md` manifest overrides the registry.** The registry's fields are defaults the parent supplies; the submodule refines its own identity (and may grow its own corpus mid-life by flipping `rule-source` to `submodule`).

**Worked disagreement.** Registry row: `| services/api | go | logical | parent |`. The submodule's own `submodule.md`: `language: rust`, `rule-source: submodule`. Resolution:

- `services/api` **IS** a boundary — the registry says so (*existence*).
- Its language is **rust** and its corpus is its **own** `architectural-rules/` — the manifest overrides (*properties*).

The registry's `go` / `parent` were defaults; the manifest refined them. No two-authorities-for-one-fact problem, because existence and properties are different facts.

### Why two filenames, not one

`submodule.md` and `scope.md` are distinct files sharing one field-core. The split is justified by a hard asymmetry:

- **`submodule.md` requires registration** — it is the identity card of a boundary the registry already declared. Unregistered → ignored.
- **`scope.md` is free-standing** — it refines scope anywhere, no registration needed.

That asymmetry doubles as a free signal for `boundary-observation`: crossing into a `submodule.md`-bearing registered path is a *submodule cross* (re-prep prompt, possibly new language); crossing a `scope.md` boundary within the same submodule is a *subfolder cross* (silent filter swap). The filename carries the cross-type — the resolver does not parse contents to decide.

> **Micro-corpus overlap.** A `scope.md` with `rule-source: submodule` opens its own corpus without registering — partially overlapping `submodule.md`'s job. Intentional flexibility (independent discipline without a registry entry), not a contradiction: the distinction stays *registration*, not *whether-corpus-can-switch*. A `scope.md` micro-corpus is still a subfolder cross (silent), because it claimed no language and no registry row.

## Graceful degradation

Every absence resolves to a defined, conservative behavior. **The no-regression invariant: a repo with zero manifest files behaves exactly as today.**

| case | behavior | |------|----------| | No `<repo>/.claude/submodules.md` | No submodules. Today's single-tree behavior, unchanged. | | `submodules.md` registers a path, but that path has no `submodule.md` | **Thin submodule** — boundary marker only. Uses the registry row's fields with no manifest refinement; resets scope to the registry row's `language` tag. | | `submodule.md` present at a path **not** in `submodules.md` | **Ignored.** Registry is authoritative for existence. (Optionally surfaced later by `review` / `memory-audit` as orphan-manifest drift — deferred.) | | No `scope.md` under a folder | "Inherit upward, no refinement." The folder uses its ancestor's accumulated scope. | | `rule-source: none` anywhere | No rules load for that subtree; treated as out-of-discipline (vendored default). | ## Forward-links — these reserve NO v1 field

### 029 org-profile merge-seam

The org-profile layer (deferred) resolves at a **different location** (`~/.claude/orgs/<profile>/` or `<repo>/.claude/profile`), not inside any file this doc defines. Therefore **no format here reserves an org field.** The seam is purely in the future `resolver`'s documented merge order — org base *prepends under* repo → submodule → subfolder, last-write-wins. v1 files stay clean; 029 drops in without a format change.

### Detect-then-propose

A future capability (specced with `resolver` / `boundary-observation`) may *notice* a folder whose tech stack differs from its peers and *propose* registering it:

> `services/api` looks like a separate Go stack — register as a submodule? (y/N)

On confirmation it writes a normal `submodules.md` row — **the same format defined above, no special marker.** Detection never acts silently and never makes an unregistered file authoritative; a wrong guess costs one dismissed prompt, not a silent rule-misapplication. Because the output is an ordinary registry row, **this doc reserves no field for it.** (This refines's original strict "no auto-detection" non-goal to *detect → propose → confirm → registry written*.)

## What this is not

- **Not the parse/walk algorithm.** Longest-prefix matching, the downward walk, and the merge algebra are the `resolver` module. This doc defines what the resolver reads.
- **Not the detection heuristic.** *What signals* "different tech stack" (build-manifest presence, extension majority) is a separate spec.
- **Not runtime code.** Static markdown conventions read by skill-prose.
- **Not a permission system.** Manifests describe scope; they do not gate edits. `kind: vendored` warns on entry but does not block `Edit`/`Write`.
- **Not pre-reserving v2 fields.** No nested-submodule, glob-scope, or per-submodule-profile field. Added via the supersede discipline when a real case appears.

## Evolving this doc

The manifest formats are evolving artefacts. When fields are added later, this doc versions via the supersede discipline (per the version-evolving-artefacts decision) — a dated amendment block, original schema intact above — not a silent rewrite.

## Consumers

| Module / skill | How it consumes | | --- | --- | | `resolver` (scope-resolution) | parses all three files; runs the longest-prefix walk + merge using the precedence + degradation rules above. | | `prep` / `discover` integration | receives the resolver's merged `(corpus, scopes, relevance, kind)` and maps it into discovery's existing filter inputs. | | `boundary-observation` | keys submodule-cross vs subfolder-cross off the filename (`submodule.md` vs `scope.md`) per the asymmetry above. | | `review` / `memory-audit` (later) | gain boundary-drift / orphan-manifest finding categories against these formats — deferred. | 