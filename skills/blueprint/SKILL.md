---
name: blueprint
description: Author a concrete blueprint for a slug — what we wanted (intent from vision + spec) and what we're building now (the mature concrete shape: classes, interfaces, dependencies, module relationships, build order) with Mermaid UML. Optional, after /draft-plan — the commit-point view an engineer reaches for before coding. Also re-blueprints existing code (--from-code). Use on /blueprint [slug] or "blueprint this" / "show the concrete shape". Never auto-fires.
---

# blueprint

The concrete-blueprint organ (renamed + repositioned from the old `document` organ). Built from [`.claude/specs/document/v1.md`](../../.claude/specs/document/v1.md).

A blueprint puts two things side by side so a competent engineer can see they're aligned and **commit**:

- **What we wanted** — the original intent (from the vision + spec).
- **What we're building now** — the *mature concrete* answer: classes, interfaces, dependencies, module/class relationships, build order — the actual shape, not a narrative of how it was planned.

It is **optional and post-planning** — reached for *after* `/draft-plan` when you want everything concretized in one place. It does **not** merge with `/draft-plan` (the plan stays the stepped plan; the blueprint is the concrete synthesis on top):

```
envision → spec → draft-plan → [ blueprint ] → execute (blueprint optional)
```

It **authors** (writes new diagrams + the concrete shape). It is **not** `codemap-visualize` (which *renders* structure from finished code — derived, post-hoc). Mermaid templates live in [`mermaid-templates.md`](mermaid-templates.md).

The point is *intent + mature concrete shape*, aligned. It is **not** a process log: how the plan was arrived at is deliberately out of scope — keep a light "key decisions" note only when it's free (§4 step 3).

## When to run

- User types `/blueprint [slug] [--from-code]`.
- User asks to "blueprint this", "show the concrete shape", "give me the classes/interfaces/deps before I build".
- `/draft-plan`'s close offers it — but the user still invokes it explicitly.
- Do **not** auto-fire. Manual only (per `universal/skill-auto-fire.md` — a blueprint is a deliberate act, not a post-plan side effect). Optional by design: small plans rarely need it.

## Inputs

1. **Slug.** From `/blueprint <slug>`, or resolved like `/draft-plan` (default → single active → ask) when omitted.
2. **Mode.** Mode 1 (intent-driven) by default; Mode 2 (`--from-code`, or auto-selected when the slug has no vision/spec).
3. **Project root.** `$CLAUDE_PROJECT_DIR` if set, else cwd.
4. **Obsidian vault root + project folder.** The vault root (`<Vault>`) is read from machine-local config — `vaultRoot` in `~/.claude/hook-config.json` — **never hardcoded** (per `universal/no-hardcoded-machine-paths.md`). If `vaultRoot` is absent, do **not** guess: surface *"Set `vaultRoot` in `~/.claude/hook-config.json` to write vault artefacts."* and write only the in-repo blueprint. `<ProjectFolder>` inference (match an existing `Projects/<Name>/` subfolder under `<Vault>`, else ask once) — the **root** comes from config, not a literal.

## Procedure

### 1. Resolve slug and mode

- **Slug:** given → use it. Omitted → resolve via `.claude/specs/INDEX.md`: `default` if active; else the single active slug; else list active slugs and ask.
- **Mode:**
 - `--from-code` flag → Mode 2.
 - Else check for `.claude/specs/<slug>/` (active) and/or `.claude/visions/<slug>/`. Present → Mode 1. Absent → Mode 2 (announce: *"No spec/vision for `<slug>` — running from code + codemap."*).
 - **Both a stale spec and live code exist:** prefer Mode 1 (spec is the intent) but add a Notes line: *"Code may have diverged from spec v<M> — verify."*

### 2. Read the sources

**Mode 1 (intent-driven):**
- `.claude/visions/<slug>/` active (if present) — intent, UX shape, module partition, boundaries → feeds **What we wanted**.
- `.claude/specs/<slug>/v<M>.md` active — the authoritative requirements + `done_criteria` → feeds **What we wanted** + the concrete surface.
- `.claude/plans/<slug>/v<N>.md` active (optional) — build order + the entities the steps name → feeds **What we're building** (dependencies/build order). Soft-referenced.

**Mode 2 (from-code):**
- `.claude/codemap.md` (if present) — module/file/class structure, exports, dependency edges. Drives the concrete shape structurally.
- The codebase — Read/Grep the modules the codemap names. Inference is bounded by codemap's extraction quality (tree-sitter AST across ~18 languages, with a regex fallback only when the tree-sitter deps aren't installed) — the same limit codemap-visualize documents.

### 3. Determine output version and paths

- In-repo: `.claude/docs/<slug>/`. Empty/absent → `v1.md`. Else → `v<N+1>.md`; mark the previous active `status: superseded`, `superseded_by: v<N+1>.md`.
- Vault: `<Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md` (or per-section split — see step 7). Reuse codemap-visualize's `<ProjectFolder>` inference and allowlist-surfacing.

### 4. Author the blueprint (adaptive — omit empty)

Three parts. **Omit any part whose source material is empty** — no "N/A" placeholders. Where a Mode-1 source is **silent on something a part needs**, **batch that part's gaps into a single `AskUserQuestion` round** (the tool caps at 4 questions; do two rounds if more). Never invent. In **Mode 2**, do not interview — infer and label (§4.4). Diagram templates are in [`mermaid-templates.md`](mermaid-templates.md).

1. **What we wanted (intent).** 1–3 short paragraphs from the vision's intent + the spec's problem/goals/done-criteria (Mode 1) or the codemap's inferred purpose (Mode 2): what the system is, who it's for, the success criterion. **No diagram.** Terse — this is the comparand, not an essay.

2. **What we're building now (the concrete shape).** The mature, concrete answer — the heart of the blueprint. Author whichever of these the slug actually has:
 - **Module / component map** — a `C4Container` block AND a flowchart fallback (template: `c4-architecture`) showing modules, responsibilities, and **the relationships between them**. Always present when there is more than one module.
 - **Classes & interfaces** — a `classDiagram` (template: `class`) of the concrete types: interfaces, classes, their key fields and operations, and **relationships** (extends / implements / composition). From the spec's defined entities + the plan's named types (Mode 1) or the codemap's `## Class graph` (Mode 2). This is what "concrete" means — the actual surface to be built.
 - **Dependencies & build order** — a dependency graph (flowchart) of module/class dependencies, plus a short **build order** list (what gets built first, what depends on it). From the plan's step ordering (Mode 1) or the codemap's dependency edges (Mode 2).
 - **Key runtime flows** *(optional)* — a `sequenceDiagram` (template: `sequence`) for the one or two interactions that actually matter. Skip the exhaustive flow catalogue — only the load-bearing ones. Mode 2: label inferred flows `%% inferred — verify against runtime`.
 - **Data model** *(optional)* — `classDiagram` + `erDiagram` (templates: `class`, `er`) only when there is persisted state worth pinning.

3. **Alignment** — 2–4 lines closing the loop: does the concrete shape in part 2 still serve the intent in part 1? Name any place it drifted, narrowed, or added scope the intent didn't ask for. This is the commit point — the engineer reads this to decide "yes, build it." *(Optionally fold in a one-line **key decision** note here when a concrete choice is non-obvious — e.g. "chose composition over an inheritance tree for the renderers." Keep it to the decision, not the deliberation — process is out of scope.)*

### 4.4 Mode 2 inference discipline

- Structural parts (module map, classes, data model, dependencies) are sourced from the codemap/code and are reasonably reliable.
- Behavioral parts (runtime flows) are **inferred** from call graphs. Every such diagram carries a `%% inferred — verify against runtime` comment as its first line, and `## Notes` states: *"Runtime flows are inferred from the codemap's static call graph (tree-sitter AST; TS/C# receiver-type-resolved, other languages syntactic name-match) — static call structure, not a runtime trace; verify against the running system. Intent (part 1) is reconstructed from code; run `/spec <slug>` to capture the real intent if it matters."*
- Never present inferred behavior as authoritative.

### 4.5 Fan-out caps

Keep diagrams legible (mirroring codemap-visualize's `l2-*` guards):
- Sequence diagram > ~12 participants → split per sub-scenario; note the split.
- Class diagram > ~15 nodes → split per module/aggregate; note the split.
A diagram that routinely blows the cap signals over-broad scope — a finding, not a render bug.

### 5. Assemble the blueprint

Frontmatter:

```yaml
---
slug: <slug>
version: <N>
status: active
spec:../../specs/<slug>/v<M>.md # Mode 1 hard-pin; omit in Mode 2 (no spec)
plan:../../plans/<slug>/v<P>.md # soft reference; omit if no plan
supersedes: v<N-1>.md # omit on v1
mode: intent-driven | from-code
created: YYYY-MM-DD
description: <one-line — what this blueprint commits to>
---
```

Body: `# Blueprint — <slug> (v<N>)`, a one-line source provenance line, then the non-empty parts in order (What we wanted → What we're building → Alignment). End with `## Notes` (caveats, omitted parts, Mode-2 inference warnings, fan-out splits).

### 6. Review gate — present before writing

**Do not write any file yet.** Present the drafted blueprint for **accept / edit / reject** (the propose-confirm-commit gate):

- **Small blueprint (≤ 3 diagrams):** render the full body inline, then ask accept/edit/reject.
- **Large blueprint:** render a **part outline** (one line per part + its diagram types), then ask: *"Show a part inline, write to disk, or edit a part? (accept / show <n> / write / edit <n> / reject)."*
- **edit:** the user describes changes ("drop the data model", "the renderer should implement IFrameSource, not extend it"). Apply to the in-conversation draft, re-present.
- **reject:** discard. Write nothing. Acknowledge and stop.

No draft scratch file — only the accepted blueprint is written.

### 7. Write artefacts (on accept)

**In-repo** (always single file): `.claude/docs/<slug>/v<N>.md`. Create the dir if absent. Supersede the previous active version when N > 1. Update `.claude/docs/INDEX.md` (same shape as specs/plans INDEX).

**Vault:** reuse codemap-visualize's conventions exactly.
- *Single-file mode* (≤ ~4 diagrams): `<Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md`, frontmatter + full body.
- *Per-section split* (above the threshold): an index note + one note per part under `<Vault>/Projects/<ProjectFolder>/Docs/<slug>/`, each with a back-link and its diagrams. Obsidian renders one-diagram-per-note far faster on large blueprints.
- **Allowlist:** if the vault write is blocked, surface the exact `outsideProjectWriteBlocker.allow` line to add. **Do not edit `hook-config.json`** — the user owns hook-config edits.

### 8. Report

```
Wrote.claude/docs/<slug>/v<N>.md (<K> parts, <D> diagrams), pinned to spec v<M>.
Wrote <Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md (+ N part notes).
Mode: <intent-driven | from-code>.
```
If Mode 2, append the inference-verification reminder.

## What blueprint does NOT do

- Does not implement anything — it pins the concrete shape; `/execute` builds it.
- Does not merge with `/draft-plan` — the plan stays the stepped plan; the blueprint is the optional concrete synthesis on top.
- Does not narrate *how* the plan was arrived at — process is out of scope; it shows intent + the mature concrete answer (a one-line key-decision note is the only concession).
- Does not render structure from finished code as its primary job — that's `codemap-visualize`. Mode 2 overlaps its input but produces an *authored* blueprint (intent + concrete shape + alignment), not a raw structural index.
- Does not use PlantUML/Graphviz. Mermaid only.
- Does not present Mode-2 inferred behavior as authoritative.
- Does not auto-fire. Manual, optional.
- Does not edit `hook-config.json`. Allowlist entries are user-owned.

## Relationship to other skills

- **codemap-visualize** — closest sibling, **opposite direction**. codemap-visualize *renders structure from finished code* (post-hoc, derived); blueprint *commits the concrete shape from intent* (pre-code). codemap-visualize shows what the code **is**; blueprint shows what it's **meant to be**. Reuses codemap-visualize's vault conventions, `<ProjectFolder>` inference, Mermaid-only limit, fan-out-cap discipline, and allowlist-surfacing.
- **draft-plan** — upstream, **no merge**. The plan is the stepped how; the blueprint is the optional concrete what. The review gate matches `draft-plan`'s.
- **spec / vision** — the intent sources (part 1). The spec is the authoritative Mode-1 input.
- **capture / `decisions/` memory** — a part-3 key-decision note may cross-link to a captured decision via an Obsidian wikilink.

## Limits (v1)

- Mermaid only. C4 emits a native block + a flowchart fallback (native C4 renders inconsistently across Obsidian versions; the flowchart is the reliable floor).
- Mode-2 behavioral inference is bounded by codemap's extraction quality (tree-sitter AST; regex only as a no-deps fallback) — inferred diagrams are labelled, never authoritative.
- Per-section vault split threshold and gap-batching granularity reuse codemap-visualize's config shape; tune with usage, do not add knobs speculatively.
- No incremental render — each run authors a full new version.
- In-repo output stays under `.claude/docs/<slug>/` (the design-artefact location) for v1; a dedicated `.claude/blueprints/` tree is a later option if blueprints and design docs need separating.
