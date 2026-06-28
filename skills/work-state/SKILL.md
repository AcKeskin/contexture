---
name: work-state
description: Report a slug's position in the scope chain (envision→spec→draft-plan→blueprint→execute→archive) as deterministic structured state — a per-stage missing/present/stale/done table, a single next-action line, and the load-bearing stale-spec-pin check. Read-only, mostly filesystem-derived (no model call for the structural state). Use when the user types /work-state <slug> or /status <slug>, asks "where is <slug> in the chain", "what's the next step for <slug>", "is <slug>'s plan stale". Mode A — never auto-fires, never mutates.
---

# work-state

The scope chain's **lifecycle-state driver**. One question — *where is this slug, and what's next?* — answered as **structured data computed from the filesystem**, not narrated. The chain keeps real per-slug state on disk (vision / spec+INDEX / plan+spec-pin / blueprint / archive); `/work-state <slug>` reads that state and reports it the same way every time, machine-checked.

Governed by [[config-efficient-helper-for-competent-engineer]]: replace the multi-directory hand-walk ("list specs, read INDEX, check the plan's pin, infer execute from recap") with one command, instant answer. The expensive part (is an artefact's *content* good enough) stays the model's/human's job — `/work-state` does only the cheap, deterministic part.

**Where it sits.** `/checkpoint` asks *is it good*; `/work-state` asks *where is it / what's next*. `/update-changelog` records *what shipped* (past); `/work-state` reports *where in-flight work stands* (present). `/close-out` *closes* a slug; `/work-state` reports *when a slug has reached* the close. Distinct lenses — `/work-state` is the one that's purely positional and purely deterministic.

## When to run

- User types `/work-state <slug>` or `/status <slug>` (explicit).
- User asks "where is `<slug>` in the chain", "what's the next step for `<slug>`", "is `<slug>`'s plan stale", "did I ever execute `<slug>`".
- **Do not auto-fire.** Mode A, user-invoked. Read-only — it never writes, never mutates an artefact (the one inviolable property; see "What it does NOT do").

## The chain and its dependency graph

The fixed stage order and what each stage depends on (the graph the resolver computes over):

| Stage | Artefact on disk | Depends on | |---|---|---| | **vision** | `.claude/visions/<slug>/` (active version via its INDEX, if present) | — | | **spec** | `.claude/specs/<slug>/` active version (`.claude/specs/INDEX.md`) | vision (soft — a spec can exist without a vision) | | **plan** | `.claude/plans/<slug>/` active version, with a `spec:` frontmatter pin | spec | | **blueprint** | `.claude/docs/<slug>/` active version (optional stage) | plan (soft — blueprint is optional) | | **execute** | *no artefact of its own* | plan | | **archive** | `.claude/archive/<date>-<slug>/` (the 092 terminus) | execute | Dependencies are **enablers, not gates** — the report never forbids skipping a stage; it only computes readiness (OpenSpec's own stance, and a non-goal here).

## Procedure (deterministic — no model call for any of this)

### 1. Resolve paths and the slug

- Base: `$CLAUDE_PROJECT_DIR/.claude/` (cwd fallback if the env var is unset), same as every chain skill.
- `/work-state <slug>` → use the slug. `/work-state` with no slug → read the specs + plans INDEX, list active slugs, and ask which (single-slug v1; no fleet view — that's `/coordinate`'s 070 territory).

### 2. Detect each stage's status

Walk the trees and classify each stage as `missing` / `present` / `stale` / `done` / `blocked`:

- **vision** — `.claude/visions/<slug>/` has an active version → `present` (it's a soft upstream; absence is not a blocker). Else `missing`.
- **spec** — read `.claude/specs/INDEX.md` for the slug's `Current` active version.
 - No row / no active version → `missing`.
 - Active version present, `done_criteria_provisional: true` (or `status: draft`) → `present` (exists but not promotable).
 - Active version present with firm `done_criteria` → `done` (the spec is ready to build against).
 - **Record the active spec version `vM`** — the plan-staleness check needs it.
- **plan** — `.claude/plans/<slug>/` active version (via `.claude/plans/INDEX.md`).
 - Spec `missing` → plan is `blocked` (gap: "no spec").
 - No active plan → `missing`.
 - Active plan present, read its `spec:` frontmatter pin (`../../specs/<slug>/v<K>.md` → version `vK`). **Compare `vK` to the spec's active `vM`:**
 - `vK == vM` → `present`.
 - `vK < vM` → **`stale`** — the load-bearing finding. Name it: "plan pins spec v<K>, active spec is v<M>."
- **blueprint** — `.claude/docs/<slug>/` active version present → `present` (optional stage; its absence is never a blocker, never the `next:` action unless explicitly asked). Apply the same spec-pin staleness if the blueprint records a pin. Else `missing` (and *not* blocked — it's optional).
- **execute** — has **no versioned artefact**. v1 is honest about this: report `execute` as **not inspectable from artefacts** unless a clear external signal exists (an `.claude/archive/<date>-<slug>/` implies execute completed → `done`; a recap or git mention of the slug's completion may be cited as a soft signal, never asserted as fact). Default: `present?` with the note "execute leaves no versioned file — confirm from recap/git." Never guess `done`.
- **archive** — `.claude/archive/<date>-<slug>/` exists → `done` (the chain is closed; 092 ran). Else `missing`.

### 3. Compute the next action and blockers

- **next action** = the **first stage in chain order** whose upstream dependency is satisfied (`done`/`present`) and whose own artefact is `missing` or `stale`. Emit its command + the reason:
 - spec missing → `next: /spec <slug>`
 - spec done, plan missing → `next: /draft-plan <slug>`
 - plan stale → `next: /draft-plan <slug> (spec v<M> active, plan pins v<K> — stale)`
 - plan present, execute not done → `next: /execute <slug>`
 - execute done, archive missing → `next: /close-out <slug>`
 - archive done → `next: — chain closed for <slug>.`
 - (blueprint, being optional, is offered as a *secondary* suggestion when plan is present and blueprint missing — never the primary `next:`.)
- **blockers** = every stage marked `blocked`, with its gap ("blueprint blocked: no plan" only when the user explicitly asks about the blueprint; otherwise optional stages are silent).

### 4. Render the report

```
Work state — <slug>

| Stage | Status | Detail | |------------|----------|-----------------------------------------------------| | vision | missing | — | | spec | done | v2 active (3 done-criteria) | | plan | stale | pins spec v1, active spec is v2 | | blueprint | missing | optional | | execute | — | leaves no versioned file — confirm from recap/git | | archive | missing | — | next: /draft-plan <slug> (spec v2 active, plan pins v1 — stale)
blockers: none
```

Keep it compact. The table + the `next:` line + the blockers line are the whole output. No prose narration of what the stages mean — the user reading `/work-state` wants the state, not an essay.

## What /work-state does NOT do

- **Does not write or mutate anything.** Read-only — no file is created, edited, moved, or deleted. This is the one inviolable property; if a future need wants a mutation (e.g. fixing a stale pin), that is `/draft-plan`'s job, offered via the `next:` line, never done here.
- **Does not judge content quality.** v1 reports structural state (exists / stale-pin / next-ready), not whether an artefact is *good enough*. Content-adequacy ("the plan covers 2 of the spec's 5 criteria") is a fenced v2 question — and `/checkpoint`'s lens, not this one.
- **Does not gate or lock the workflow.** It *reports* readiness; it never *forbids* skipping a stage. Dependencies are enablers, not gates.
- **Does not guess execute-done.** Execute leaves no versioned artefact; v1 says so honestly rather than inventing a status. Only an archive folder (or an explicit user/recap confirmation) upgrades execute to `done`.
- **Does not call the model for the structural state.** Stage detection, version-pin comparison, and ready-gap are pure filesystem logic.
- **Does not track a fleet.** Single-slug; the multi-slug session view is `/coordinate`'s territory.
- **Does not auto-fire.** Mode A, user-invoked.

## Relationship to other organs

- **026 (done-criteria) / 051 (draft-plan spec-pin)** — supply the contracts the resolver reads: the spec's active version (specs INDEX) and the plan's pinned version (`spec:` frontmatter). The stale-pin check is *their* consistency, surfaced.
- **archive** — the chain's close; `/work-state` reports `archive: done` when `.claude/archive/<date>-<slug>/` exists. They bracket the chain (093 = where are you, 092 = close it out).
- **update-changelog** — records *completed* work (past); `/work-state` reports *in-flight* state (present). The pair answers "what shipped / where's the active work" — the two halves of session re-alignment.
- **checkpoint** — orients over a slug for *fit/intent audit*; `/work-state` reports *chain position*. checkpoint asks "is it good," `/work-state` asks "where is it / what's next." Standalone (not folded into checkpoint or discover — the fast-path ergonomics want one dedicated command).
- **discover** — shares slug-path resolution conventions; `/work-state` stays a separate command.
- **execute** — `/work-state`'s stale-pin check is most valuable as a *pre-run guard* (execute warning on a plan pinned to a superseded spec). That is a **deferred v2 seam** — named in execute's relationships, not built in v1; v1 ships the standalone report only.
- **coordinate** — a multi-slug `/work-state` would overlap coordinate's session board; kept single-slug to stay clear of it.
- **[[config-efficient-helper-for-competent-engineer]]** — the resolver is leverage (one deterministic command) over the multi-directory hand-walk.

See `.claude/specs/pipeline-state/v1.md` for the design and the resolved open questions. (The spec slug retains the original `pipeline` name; the user-facing command was renamed to `/work-state` for clarity.)
