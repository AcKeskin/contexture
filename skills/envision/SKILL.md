---
name: envision
description: Interview-driven top-level project vision — intent, UX shape, module partition, boundaries, non-goals — into a versioned .claude/visions/<slug>/. Breadth-over-depth, mandatory module-map; the once-per-project doc upstream of /spec. Use on /envision or "sketch / partition / shape a new project". Not for one piece of an existing system (use /spec). Never auto-fires.
---

# envision

Greenfield project shaping. Captures what a project *is*, who uses it and how, what modules it breaks into, what each module owns and does not own, how they relate, and what is explicitly out of scope — into a single versioned vision file. Upstream of `/spec`; every module the vision names becomes a candidate slug for its own `/spec` run.

The discipline is breadth-over-depth. The skill refuses to let the interview drift into spec-level detail — when the user starts describing functions, files, or data shapes, the skill redirects.

## When to run

- User types `/envision` (no args) or `/envision <slug>`.
- User asks to sketch / draw / partition / shape / map a *new* project at the top level.
- Manual evolution: user types `/envision <slug>` for an existing slug → evolve flow on the deltas.

Do **not** auto-fire. Do **not** invoke as part of any other skill's chain. `/envision` is user-invoked only.

Do **not** run when:
- The user is asking about *one piece* of an existing system. That's `/spec` territory.
- The idea is still half-formed or blurry — run `/brainstorm` first to shape it (name, description, edges, end-goal), then come back to `/envision`.
- The project already has clear requirements and the user just wants to build. Skip straight to `/spec`.
- The conversation is about a one-line fix, a refactor, or any task with no architecture decision attached.

## Forms

- `/envision` — write to reserved slug `default`. For the case where the repo *is* the project.
- `/envision <slug>` — named slug. Create if new in INDEX, evolve if existing.
- `/envision <slug> --new` — explicit fresh slug. Refuse if slug exists.
- `/envision <slug> --abandon` — mark active version abandoned.

`<slug>` must match `^[a-z0-9][a-z0-9-]*$`.

## Inputs

1. **Project root.** `$CLAUDE_PROJECT_DIR` if set, else cwd.
2. **Visions tree.** `<root>/.claude/visions/`. Created lazily.
3. **Existing INDEX.** `<root>/.claude/visions/INDEX.md`. Parsed to decide create-vs-evolve.
4. **Active version file** (evolve flow only). Path: `<root>/.claude/visions/<slug>/v<M>.md` where M = active per INDEX.
5. **Grounded context.** Invoked via `skills/discover/SKILL.md` after the interview body is populated.

## Procedure

### 1. Resolve project root, slug, and intent

- Project root: `$CLAUDE_PROJECT_DIR` or cwd.
- Slug: no-arg form → the reserved slug `default`; otherwise validate the given slug against `^[a-z0-9][a-z0-9-]*$` and re-prompt once on a bad value. `default` is reserved but allowed explicitly.
- Intent (create vs evolve vs abandon):
  - `--abandon` → abandon flow (step 7).
  - `--new` + slug exists in INDEX → stop with message.
  - Slug missing from INDEX → create flow.
  - Slug present in INDEX with `status: active` → evolve flow.

### 2. Run the interview

Use `AskUserQuestion` when available; plain text otherwise. Cap ~6–10 questions. Cover, in order:

1. **Intent.** What is this? Who is it for? One-sentence success criterion. Smallest shipped version that counts.
2. **UX shape.** Surfaces (CLI / web / mobile / desktop / immersive / library / headless). Main user flow walked through in prose. Secondary flows if relevant.
3. **Module partition.** 4–8 named top-level boxes, each with a one-line role. Push back below 3 or above 8.
4. **Boundaries.** Per module: owns / explicitly delegates. Inside vs outside the system.
5. **Relations.** Module-to-module: sync calls / events / shared store / file / network. Direction. Entry point.
6. **Cross-cutting concerns.** Auth, persistence, observability, config, error handling — each owned by a module or declared horizontal with a one-line convention.
7. **Non-goals.** Minimum three concrete bullets.

**Drift discipline.** If the user starts describing functions, files, data shapes, classes, or APIs:

> That's spec-level detail — let's keep this at module-role granularity. We'll capture it in `/spec <module>` once the vision is locked.

**Meta-question after ~8.** *"I've asked 8 questions. Any top-level area we haven't covered?"* Respect the answer.

**Evolve flow.** Open the active version. Summarise current shape in 3–6 bullets: intent, UX surfaces, module list (count), non-goals count. Ask *"What's changing?"*. Interview only on the deltas. Untouched sections carry forward verbatim.

### 3. Ground

Invoke `skills/discover/SKILL.md`:

```
{
  task_keywords: [<from intent + module names>],
  scopes: [<detected language>, <detected domain>, "global"],
  kind: ["architectural-rule", "decision", "lesson", "project"],
  top_n: 12,
  render_bodies: true,
  include_recaps: false
}
```

Tighter inclusion bar than `/spec`: only fold in rules / decisions / lessons that would materially shape the **partition or boundaries**. Skip implementation-level guidance. Cite by name in the `Grounded context` section — never absorb silently.

### 4. Produce the module map

Mandatory, central, not decorative. Steps:

- **Choose renderer.** Mermaid `flowchart` if relations are mostly directed and the graph is < ~15 edges. ASCII box-drawing in a code fence otherwise — Mermaid lays out cycle-heavy graphs poorly.
- **Nodes:** every module declared in the interview, identified by slug.
- **Edges:** every declared relation, with a short label (`reads`, `writes`, `dispatches`, `subscribes`, `owns`, `delegates to`).
- **Cross-cutting:** either a horizontal lane (Mermaid `subgraph "Cross-cutting"`) or annotated nodes attached to each module they affect. Do not omit them — that smears the concern across the body text.
- **Entry point:** highlighted. Mermaid: `:::entry` class with a `classDef entry stroke:#f60,stroke-width:2px` line. ASCII: `[ENTRY]` annotation above the box.

**Tangle check.** If the resulting graph has > 12 nodes, > 25 edges, or > 1 cycle that isn't an explicit feedback loop, surface it as a finding before writing:

> The current partition produces a tangled diagram (N modules, M edges, K cycles). That usually means a module is missing, or one existing module is doing two jobs. Want to revise before I write this?

Wait for the user's answer. On revise → loop back to the partition interview. On proceed-anyway → write the diagram and add a bullet to `## Open questions` flagging the tangle.

### 5. Write the vision file

Path: `<root>/.claude/visions/<slug>/v<N>.md`.

Frontmatter (mandatory):

```yaml
---
slug: <slug>
version: <N>
status: active
supersedes: v<N-1>.md   # omit on v1
created: YYYY-MM-DD
description: <one-line>
modules:
  - <module-slug-1>
  - <module-slug-2>
non_goals_count: <integer ≥ 3>
---
```

Body shape — sections in this exact order:

```markdown
# Vision — <slug> (v<N>)

## Elevator pitch
<one paragraph. What this is, who it is for, success in one sentence.>

## UX walkthrough
<prose. Surfaces named. Main flow start-to-finish. Secondary flow in its own paragraph if it exists. No wireframes, no API shapes.>

## Module map
<Mermaid flowchart or ASCII diagram. Every module, every relation, cross-cutting concerns visible, entry point highlighted.>

## Modules
### <module-slug>
- **Role:** <one sentence>
- **Owns:** <comma-separated nouns>
- **Depends on:** <comma-separated module-slugs / external systems; "nothing — entry point" for the entry>
- **Does not do:** <comma-separated — what someone might assume but is delegated>

<(repeat per module — exactly these four lines, no more)>

## Cross-cutting concerns
- **<concern>** — owned by <module-slug>
- **<concern>** — horizontal: every module handles it via <one-line convention>
<(or "None identified — every concern lives inside a single module.")>

## Non-goals
- <bullet — what this explicitly does not do, and why>
- <bullet>
- <bullet — minimum 3>

## Grounded context
<loaded rules / decisions / lessons that would shape the partition. Cite by name. "None applicable" is valid.>

## Open questions
- <unresolved — things that need answering before any module's `/spec` runs productively>

## Next moves
<2–4 sentences. Which module to `/spec` first and why. Which can wait. Open questions that block specing.>

## Changes from v<N-1>   ← evolve flow only
- <bullet per changed section>
```

**Discipline checks before writing:**

- Per-module section has exactly the four bullet lines. No fifth bullet, no nested detail.
- Each module's `Role` is ≤ ~20 words. Compress if over.
- `Modules` frontmatter list matches the `## Modules` headings exactly — same count, same order, same slugs.
- `non_goals_count` matches the bullet count under `## Non-goals` and is ≥ 3.
- Module map renders — sanity-check Mermaid syntax mentally; for ASCII, every box has matching corners.

If any check fails, fix in-place before writing. Do not write a malformed vision and patch after.

### 6. Update the previous active version (evolve flow only)

- Set `status: superseded` in `v<N-1>.md`.
- Add `superseded_by: v<N>.md` to its frontmatter.
- Do not modify the body. Superseded versions are read-only.

### 7. Abandon flow

When `--abandon` was passed:

Confirm:

> Mark `<slug>` v<N> abandoned? Status is irreversible without manual edit. (y/N)

On `y`:
- Update active version frontmatter to `status: abandoned`.
- Update INDEX.
- Do not write a new file.

On `n`: stop without changes.

### 8. Update INDEX.md

Path: `<root>/.claude/visions/INDEX.md`. Regenerated from on-disk frontmatter each invocation — do not hand-edit between runs.

```markdown
# Visions index

| Slug | Current | Status | Created | Modules | Description |
|------|---------|--------|---------|---------|-------------|
| <slug> | v<N> | active | YYYY-MM-DD | <count> | <one-line> |
```

Sort rows by `Created` descending. Create the file lazily on first vision.

### 9. Close

Tell the user (filling in the actual values):

> Wrote `.claude/visions/<slug>/v<N>.md` declaring K modules: `<module-slug-1>`, `<module-slug-2>`, …. INDEX updated. Recommended: start a fresh session, then `/spec <module-slug>` for the module you want to build first. Visions evolve cheaply — re-run `/envision <slug>` when the partition stops fitting.

## Anti-patterns to refuse

- **Implementation detail.** Function names, class names, file paths, data schemas, API endpoint shapes. Redirect to `/spec`.
- **Module count < 3 or > 8.** Below 3, the partition isn't doing work. Above 8, the project either needs sub-projects (re-run with named slugs per sub-project) or the user is enumerating files, not modules.
- **No non-goals.** Vision with zero non-goals = vision that will absorb scope creep. Refuse to write — push the user for at least three.
- **Cross-cutting concerns smeared into module roles.** If "logging" appears in three different modules' Owns lines, that's a cross-cutting concern, not a per-module responsibility. Promote it.
- **Skipping the module map.** The diagram is the load-bearing artefact. If the user wants to skip it ("I don't need a picture"), explain: the picture is how downstream Claude sessions reconstruct the partition without re-reading the whole document. Insist.
- **Specs-as-vision-modules confusion.** A vision module ≠ a spec slug 1:1 by name guarantee. Most of the time it should match, but a vision can declare a module that's later specced as several sub-slugs (`engine` → `engine-core`, `engine-renderer`). That's fine; the warning in step 3 of the spec-alignment check surfaces it.

## Relationship to /spec, /draft-plan, /execute

`/envision` is upstream of all of them. The chain:

```
/envision <project>     ← this skill
  ↓ (per module)
/spec <module-slug>
  ↓
/draft-plan <module-slug>
  ↓
/execute <module-slug>
```

Alignment is **advisory, not enforced** between `/envision` and `/spec`:

- `/spec <slug>` where `<slug>` matches a module in the active vision: proceed normally. The spec's `Grounded context` may cite `vision <slug> v<N> module <module-slug>` as the source of its boundary assumptions.
- `/spec <slug>` where `<slug>` does NOT match any active vision's modules: `/spec` warns once and continues. Warning is a smell-finder, not a gate.

This means: mature projects with no vision are not retroactively forced into one. `/envision` is for greenfield top-level shaping. Use it where it helps; don't bolt it onto established codebases just for symmetry.

## What this skill does not do

- Does not implement anything.
- Does not run `/spec`, `/draft-plan`, or `/execute`.
- Does not create folder skeletons or `src/` scaffolding. Layout decisions belong in `/spec` + `/draft-plan`.
- Does not modify code files. Only writes under `.claude/visions/`.
- Does not produce wireframes, data models, API shapes, or class diagrams.
- Does not silently overwrite. Every write creates a new `v<N>.md` or transitions frontmatter explicitly.
- Does not auto-fire.

See also: [`commands/envision.md`](../../commands/envision.md), [`commands/spec.md`](../../commands/spec.md), [`commands/draft-plan.md`](../../commands/draft-plan.md).
