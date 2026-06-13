---
name: system-review
description: "[DEPRECATED → use /checkpoint --scope corpus] Step back over the organ system itself — skills / agents / commands / hooks / rules — and surface where it no longer coheres (responsibility overlap, dead config, pipeline gaps, vision drift). Routes consolidation/drop candidates to proposal stubs; never edits organs in place. /system-review [area]. Never auto-fires."
deprecated: true
---

# system-review

> **Deprecated.** Superseded by `/checkpoint --scope corpus`, which runs these coherence passes through the shared `retrospect-core` engine. Kept present and fully functional until `/checkpoint` is proven in real use, then retires — new work should reach for `/checkpoint`.

The system / surface-coherence organ. Implements the Lens-B half of. Runs the four coherence passes over the organ surface; delegates orientation, baseline-diff, rendering, routing, and persistence to [retrospect-core](../retrospect-core/SKILL.md).

**Where it sits.** [retrospect](../retrospect/SKILL.md) audits the *decision & delivery history*; system-review audits the *system that history produced*. Same altitude (step back over the whole, not one file/session), same engine, different target: retrospect reads proposals/decisions/recaps; system-review reads `skills/`, `agents/`, `commands/`, `hooks/`, `settings/`, `architectural-rules/`, `mcps/`, and the vision. It is the automation of the manual coverage-map re-sort and "drop pass" the backlog does by hand — but pointed at the *organs*, not the *decisions*.

**v1 scope ( OQ2): config-repo-scoped.** system-review audits the contexture harness surface — the organ system whose code *is* the thing under review. The name (`system-review`, not `organ-audit`) is deliberately general so the same skill can later review *any* codebase's architecture (modules/services/boundaries vs its design doc); that generalization is a non-breaking later step, parked until a second codebase needs it. Until then, "the system" = the harness.

## When to run

- User types `/system-review` or `/system-review <area>` (area = `skills` | `agents` | `hooks` | `rules` | a subsystem name).
- Natural language: "review the organ system", "is the harness still coherent", "are any skills overlapping", "what's dead config", "does this still match the vision".
- **Do not auto-fire.** Mode A, user-invoked. No hook, no schedule by default.

## Inputs

1. **Area argument** (optional) — narrows the passes to one surface (§1).
2. **The organ surface** — the `contexture` repo root (resolve from `$CLAUDE_PROJECT_DIR`/cwd; if invoked elsewhere, locate the config repo via the `~/.claude` symlinks' targets):
 - `skills/*/SKILL.md` — the skill organs (each has frontmatter `name` + `description`).
 - `commands/*.md` — the command shims (each should map to a skill).
 - `agents/*` — the subagent roster.
 - `hooks/*` + `settings/*` — the hook wiring and settings bundles.
 - `architectural-rules/**` — the rule corpus (scopes + relevance gates).
 - `mcps/*` — the MCP servers.
3. **The vision** — `.claude/visions/default/v1.md` (and any per-project vision) — the coherence-pass yardstick. Also the project's proposal/coverage map, if it keeps one, for the subsystem framing.
4. **Usage signal (best-effort)** — git churn on each organ (`git log` recency/frequency) as a proxy for "is this used"; there is no runtime invocation log, so dead-config findings are *candidates*, never assertions (see Failure modes).

## Procedure

### 1. Resolve area

| Form | Resolution | | --- | --- | | `/system-review` | All four passes over the whole organ surface. scope-slug = `system`. | | `/system-review skills` | Passes restricted to `skills/` + `commands/` (overlap + dead + gaps among skills). scope-slug = `system-skills`. | | `/system-review hooks` / `agents` / `rules` | Restricted to that surface. scope-slug = `system-<area>`. | ### 2. Orient (delegate)

Call `retrospect-core.orient` with:

```
{ kind: "system",
 roots: [ "<config-root>/skills/", "<config-root>/commands/", "<config-root>/agents/",
 "<config-root>/hooks/", "<config-root>/architectural-rules/", "<config-root>/mcps/" ],
 report_dir: "<config-root>/.claude/system-reviews" }
```

The census counts organs by type (N skills, M commands, K agents, …) and the since-last-run delta surfaces organs added/changed since the baseline — the **focus hint** for where coherence is most likely to have slipped (newly-added skills are the prime overlap risk; a command without a skill is the prime dead-config risk).

### 3. Run the four passes

Each pass emits `Finding` objects per the retrospect-core shape.

#### Pass 1 — Responsibility overlap

Read each organ's `name` + `description` (and, where ambiguous, its "What X does NOT do" / "Relationship to other organs" sections). Flag pairs whose jobs have started to blur:
- Two skills whose descriptions claim overlapping triggers or outputs (e.g. does `code-review` overlap `review`? does a new skill's "what happened" overlap `recap`?).
- A skill and an agent that do the same job at different layers without a stated boundary.
→ `verdict: OVERLAP`, severity Medium–High, `route: proposal` (a boundary-clarification or merge stub) or `route: direct-fix` (add the missing "Relationship to" / boundary line when the fix is a one-paragraph charter note). This pass is exactly the kind of drift 060 itself had to resolve for `recap`/`memory-audit` — the boundary it wrote down is the template for what a clean resolution looks like.

#### Pass 2 — Dead / unused config

- **Command without a skill** — a `commands/<x>.md` whose `Run the \`<x>\` skill` target doesn't exist under `skills/`. → `DEAD`, `route: direct-fix` (remove the orphan shim) or `proposal`, High (a broken command is user-visible).
- **Skill without a command and not library-only** — a user-facing skill (description implies a `/x` trigger) with no `commands/<x>.md`. Distinguish from intentional library-only skills (`deliver`, `retrospect-core`) which correctly have none. → `GAP`, `route: direct-fix` (add the shim).
- **Orphaned hook / settings bundle** — a hook file not referenced by any settings bundle, or a settings key pointing at a missing hook. → `DEAD`, `route: proposal` or `direct-fix`.
- **Unused agent / rule scope** — an agent or `architectural-rules/<scope>/` with no churn and no organ referencing it. → `DEAD-candidate`, severity Low, `route: none` (surface for judgment — absence of churn is weak signal; see Failure modes).

#### Pass 3 — Pipeline gaps & redundancy

Map the organs onto the lifecycle pipeline (envision → spec → draft-plan → document → execute → review; prep/discover/deliver substrate; capture/recap/retrospect/system-review backward-looking) and flag:
- **Gaps** — a stage the pipeline implies but no organ fills.
- **Redundancy** — the same *mechanism* implemented in two organs that should share it (the thing `retrospect-core`'s extraction fixed; `review`'s inlined orient/diff that `retrospect-core` now also has is a known, accepted instance — flag new ones, not this one).
→ `route: proposal`, severity Medium.

#### Pass 4 — Coherence vs vision

Read the vision (`visions/default/v1.md`) and the project's subsystem/coverage map, if it keeps one. For each vision module / stated direction, check the organ surface still serves it; for each major organ cluster, check it still traces to a vision module (or a deliberate post-vision proposal).
- Organ cluster with no vision/proposal lineage → `verdict: UNTRACED`, `route: capture` (record the rationale) or `proposal` (ratify it), Low–Medium.
- Vision module with no organ serving it → `verdict: UNSERVED-MODULE`, `route: proposal`, Medium.

### 4. Diff, render, report, route, persist (delegate)

1. `retrospect-core.diff(findings, "<config-root>/.claude/system-reviews/<scope-slug>/latest.md")`.
2. `retrospect-core.render(report)` — the mandatory diagram defaults to an **organ-dependency / overlap graph** (organs as nodes, "calls"/"feeds" as edges, overlap pairs and dead nodes highlighted).
3. Present the report; `retrospect-core.route` per finding. System-change findings route to **proposal stubs** (the `proposals/` surface is where organ changes belong) — confirm the slot with the user before writing. One-paragraph charter notes and orphan-shim removals route to `direct-fix`.
4. `retrospect-core.persist(report, "<scope-slug>")` — baseline for the next run.

## Failure modes

- **Dead-config is a candidate, not a verdict.** There is no runtime invocation log — "unused" is inferred from churn + cross-references, which is weak. A library-only skill has no command *by design*; a rule scope is relevance-gated and may correctly be cold for months (059's canonical pre-stage scopes are deliberately unused until their code lands). Pass 2's low-confidence findings are `route: none` (surface for judgment); never auto-remove an organ on churn alone.
- **Overlap is often intentional.** Two organs covering adjacent ground with a *stated* boundary is correct (review/memory-audit, prep/review). Only flag overlap when the boundary is *absent or contradicted*, and put the legitimate adjacencies in the "looks bad but actually fine" section.
- **Invoked outside the config repo.** Locate the config root via the `~/.claude/skills` symlink targets; if it can't be found, report and stop (don't audit an arbitrary cwd as if it were the harness).
- **Vision absent.** Run passes 1–3; skip Pass 4 with a header note ("no vision found — coherence pass skipped").

## What system-review does NOT do

- **Does not auto-fire.** Mode A, user-invoked.
- **Does not edit organs in place** beyond `direct-fix` (orphan-shim removal, a one-paragraph charter/boundary note). Substantive organ changes — merges, splits, new organs, retirements — route to **proposal stubs** so they go through the normal design pipeline. It never rewrites a skill's behaviour silently.
- **Does not remove anything on churn signal alone.** Dead-config low-confidence findings are surfaced for judgment, never auto-applied.
- **Does not audit organ *correctness* or code quality.** That's `/review` on the config repo's own code. system-review audits the *system's shape* — overlap, gaps, coherence — not whether a given skill's logic is right.
- **Does not duplicate retrospect.** retrospect audits decisions/delivery; system-review audits the organ surface. They share the engine, not the corpus.
- **Does not generalize to arbitrary codebases yet.** v1 is the harness surface (OQ2). The general "review any system's architecture vs its design doc" mode is a deferred, non-breaking extension.

## Relationship to other organs

- **retrospect-core** — the shared engine (orient/diff/render/route/persist).
- **retrospect (060)** — the history-side sibling. system-review's Pass-4 untraced findings often pair with a retrospect consolidation finding (the decision and the organ drifted together).
- **review (005)** — code-quality review of the config repo's *implementation*; system-review is structure-review of its *organ shape*. Complementary, non-overlapping (the boundary this skill itself must keep).
- **capture (011)** — the route for ratifying an untraced organ's rationale.
- **the project's proposals / backlog** — the primary output route; organ changes become proposals.
- **the vision** (`visions/default/v1.md`) — the Pass-4 yardstick.

See the design notes for the v1-scope decision and the boundary rationale.
