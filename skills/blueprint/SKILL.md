---
name: blueprint
description: "Author a concrete blueprint for a slug: intent plus the shape being built (classes, interfaces, dependencies, build order) as Mermaid UML. After /draft-plan, from code (--from-code), or sketched together one view per turn next to /spec (--sketch). Use on /blueprint [slug], or when the user wants to see or design the concrete shape before coding. Never auto-fires."
---

# blueprint

The concrete-blueprint organ.

A blueprint puts two things side by side so a competent engineer can see they're aligned and **commit**:

- **What we wanted** — the original intent (from the vision + spec).
- **What we're building now** — the *mature concrete* answer: classes, interfaces, dependencies, module/class relationships, build order — the actual shape, not a narrative of how it was planned.

It is **optional and post-planning** — reached for *after* `/draft-plan` when you want everything concretized in one place. It does **not** merge with `/draft-plan` (the plan stays the stepped plan; the blueprint is the concrete synthesis on top):

```
envision → spec → draft-plan → [ blueprint ] → execute      (blueprint optional)
            ↑
     [ blueprint --sketch ]                                   (sketch optional, any time)
```

**Sketch mode** (`--sketch`) is the early, hands-on form: the user and Claude design the feature together, one view per turn (states, sequence, classes, hierarchy, build order, interfaces), in one living `.claude/docs/<slug>/sketch.md`. It needs no spec and has no review gate; `/spec` and the later blueprint read it. Procedure: [sketch-mode.md](sketch-mode.md). `sketch-check.mjs` syncs the vault copy and runs the name check, so a turn costs one small read and one Edit. The rest of this file covers Modes 1 and 2.

It **authors** (writes new diagrams + the concrete shape). It is **not** `visualise-codemap` (which *renders* structure from finished code — derived, post-hoc). Mermaid templates live in [`mermaid-templates.md`](mermaid-templates.md).

The point is *intent + mature concrete shape*, aligned. It is **not** a process log: how the plan was arrived at is deliberately out of scope — keep a light "key decisions" note only when it's free (§4 step 3).

## When to run

- User types `/blueprint [slug] [--from-code | --sketch]`.
- User asks to "sketch the design", "draw the states / sequence / classes with me", or design a feature visually → `--sketch`.
- User asks to "blueprint this", "show the concrete shape", "give me the classes/interfaces/deps before I build".
- `/draft-plan`'s close offers it — but the user still invokes it explicitly.
- Do **not** auto-fire. Manual only (per `universal/skill-auto-fire.md` — a blueprint is a deliberate act, not a post-plan side effect). Optional by design: small plans rarely need it.

## Inputs

1. **Slug.** From `/blueprint <slug>`, or resolved like `/draft-plan` (default → single active → ask) when omitted.
2. **Mode.** Mode 1 (intent-driven) by default; Mode 2 (`--from-code`, or auto-selected when the slug has no vision/spec); sketch (`--sketch`, never auto-selected).
3. **Project root.** `$CLAUDE_PROJECT_DIR` if set, else cwd.
4. **Obsidian vault root + project folder.** The vault root (`<Vault>`) is read from machine-local config — `vaultRoot` in `~/.claude/hook-config.json` — **never hardcoded** (per `universal/no-hardcoded-machine-paths.md`). If `vaultRoot` is absent, do **not** guess: surface *"Set `vaultRoot` in `~/.claude/hook-config.json` to write vault artefacts."* and write only the in-repo blueprint. `<ProjectFolder>` inference (match an existing `Projects/<Name>/` subfolder under `<Vault>`, else ask once) — the **root** comes from config, not a literal.

## Procedure

### 1. Resolve slug and mode

- **Slug:** given → use it. Omitted → resolve via `.claude/specs/INDEX.md` per draft-plan's canonical slug-resolution cascade ([draft-plan SKILL.md § Forms](../draft-plan/SKILL.md)). With `--from-code` and no slug, there is usually nothing to resolve against — **ask for the slug** (it names the output directory); never derive one silently from a path or a directory name.
- **Mode:**
  - `--sketch` flag → read [sketch-mode.md](sketch-mode.md) and follow it instead of steps 2–8.
  - `--from-code` flag → Mode 2.
  - Else check for `.claude/specs/<slug>/` (active) and/or `.claude/visions/<slug>/`. Present → Mode 1. Absent → Mode 2 (announce: *"No spec/vision for `<slug>` — running from code + codemap."*).
  - **Both a stale spec and live code exist:** prefer Mode 1 (spec is the intent) but add a Notes line: *"Code may have diverged from spec v<M> — verify."*

### 2. Read the sources

**Mode 1 (intent-driven):**
- `.claude/visions/<slug>/` active (if present) — intent, UX shape, module partition, boundaries → feeds **What we wanted**.
- `.claude/specs/<slug>/v<M>.md` active — the authoritative requirements + `done_criteria` → feeds **What we wanted** + the concrete surface.
- `.claude/plans/<slug>/v<N>.md` active (optional) — build order + the entities the steps name → feeds **What we're building** (dependencies/build order). Soft-referenced.
- `.claude/docs/<slug>/sketch.md` (if present) — the design the user sketched. Start part 2 from its diagrams and signatures instead of drawing from scratch; its `## Decisions` are settled. Where the blueprint departs from the sketch, say so in Alignment.

**Mode 2 (from-code):**
- `.claude/codemap.md` (if present) — module/file/class structure, exports, dependency edges. Drives the concrete shape structurally.
- The codebase — Read/Grep the modules the codemap names. Inference is bounded by codemap's extraction quality (tree-sitter AST across ~18 languages, with a regex fallback only when the tree-sitter deps aren't installed) — the same limit visualise-codemap documents.

### 3. Determine output version and paths

- In-repo: `.claude/docs/<slug>/`. No `v*.md` yet → `v1.md`. Else → `v<N+1>.md`. `sketch.md` is not a version. Versioning follows spec's canonical contract ([spec SKILL.md § Versioning contract](../spec/SKILL.md)): mark the previous version superseded with a `superseded_by` pointer and regenerate the INDEX.
- Vault: `<Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md` (or per-section split — see step 7). Reuse visualise-codemap's `<ProjectFolder>` inference and allowlist-surfacing.

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

Keep diagrams legible (mirroring visualise-codemap's `l2-*` guards):
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
spec: ../../specs/<slug>/v<M>.md     # Mode 1 hard-pin; omit in Mode 2 (no spec)
plan: ../../plans/<slug>/v<P>.md      # soft reference; omit if no plan
supersedes: v<N-1>.md                 # omit on v1
mode: intent-driven | from-code
created: YYYY-MM-DD
description: <one-line — what this blueprint commits to>
---
```

Body: `# Blueprint — <slug> (v<N>)`, a one-line source provenance line, then the non-empty parts in order (What we wanted → What we're building → Alignment). End with `## Notes` (caveats, omitted parts, Mode-2 inference warnings, fan-out splits).

### 6. Review gate — present before writing

**Do not write any file yet.** Present the drafted blueprint for **accept / edit / reject** (the propose-confirm-commit gate), offering a [human-view](../human-view/SKILL.md) projection — *"want the plain-prose approval view? (/human-view)"* — alongside:

- **Small blueprint (≤ 3 diagrams):** render the full body inline, then ask accept/edit/reject.
- **Large blueprint:** render a **part outline** (one line per part + its diagram types), then ask: *"Show a part inline, write to disk, or edit a part? (accept / show <n> / write / edit <n> / reject)."*
- **edit:** the user describes changes ("drop the data model", "the renderer should implement IFrameSource, not extend it"). Apply to the in-conversation draft, re-present.
- **reject:** discard. Write nothing. Acknowledge and stop.

No draft scratch file — only the accepted blueprint is written.

### 7. Write artefacts (on accept)

**In-repo** (always single file): `.claude/docs/<slug>/v<N>.md`. Create the dir if absent. Supersede the previous active version when N > 1. Update `.claude/docs/INDEX.md` (same shape as specs/plans INDEX).

**Vault:** reuse visualise-codemap's conventions exactly.
- *Single-file mode* (≤ ~4 diagrams): `<Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md`, frontmatter + full body.
- *Per-section split* (above the threshold): an index note + one note per part under `<Vault>/Projects/<ProjectFolder>/Docs/<slug>/`, each with a back-link and its diagrams. Obsidian renders one-diagram-per-note far faster on large blueprints.
- **Allowlist:** if the vault write is blocked, surface the exact `outsideProjectWriteBlocker.allow` line to add. **Do not edit `hook-config.json`** — the user owns hook-config edits.

### 8. Report

```
Wrote .claude/docs/<slug>/v<N>.md (<K> parts, <D> diagrams), pinned to spec v<M>.
Wrote <Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md (+ N part notes).
Mode: <intent-driven | from-code>.
```
If Mode 2, append the inference-verification reminder.

More in [reference.md](reference.md): What blueprint does NOT do, relationship to other skills, limits (v1).
