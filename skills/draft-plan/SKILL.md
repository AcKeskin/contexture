---
name: draft-plan
description: Produce a versioned plan under `.claude/plans/<slug>/v<N>.md` from the active spec for that slug. Each step has a goal, files, expected outcome, and verification criteria; plans pin to a specific spec version. The drafted plan is presented for review (accept / edit / reject) before it is written to disk. Use when the user types /draft-plan or asks to plan out the implementation of a specced feature. Mode A only — never auto-fires.
---

# draft-plan

Run the `plan` flow — turn an active spec (or a degraded `--task` description) into a versioned, stepped implementation plan. Upstream of `/execute`; downstream of `/spec`. Plans pin to the exact spec version they were drafted against.

## When to run

- User types `/draft-plan`, `/draft-plan <slug>`, or `/draft-plan <slug> --task "<text>"`.
- User asks to "plan out", "break into steps", "draft an implementation plan" for a specced feature.
- After `/spec` lands, before `/execute`.

Do **not** auto-fire. For a one-sentence change, the triviality check (step 7) will short-circuit and tell the user to just do it.

## Forms

- `/draft-plan` (no slug) — resolve in this order: (1) if `default` is active in `.claude/specs/INDEX.md`, use it; (2) else if exactly one named slug is active, use it; (3) else list active slugs and ask.
- `/draft-plan <slug>` — read `.claude/specs/<slug>/` active version, write `.claude/plans/<slug>/v<N>.md`.
- `/draft-plan <slug> --task "<text>"` — degraded mode: no spec required, the text is the input. Slug still required for the output path. Use `default` for the no-decision case.

## Procedure

1. **Locate the trees.** `$CLAUDE_PROJECT_DIR/.claude/specs/` and `.claude/plans/` (cwd fallback if env var unset). Lazy mkdir.

2. **Resolve the slug.**
 - Slug given → use it.
 - No slug, `default` is active in `.claude/specs/INDEX.md` → use `default`.
 - No slug, no `default` but exactly one other active spec → use it.
 - No slug, multiple active → list active slugs and ask which.
 - No slug, no specs → only valid with `--task` (which itself requires an explicit slug); otherwise stop with: *"No specs and no task description. Run `/spec` first or pass `<slug> --task`."*

3. **Resolve the input.**
 - Default: read the active version file (`.claude/specs/<slug>/v<M>.md` where M = active version per INDEX).
 - With `--task`: use the task text. Warn: *"No spec — running in degraded mode. For non-trivial work, run `/spec <slug>` first."*

 **Done-criteria gate** (default mode only — skipped with `--task` since no spec exists):
 - If the spec's frontmatter `done_criteria_provisional: true`, refuse to plan:

 > Spec `<slug>` v<M> has provisional done-criteria. Plans cannot be drafted against an under-specified spec — re-run `/spec <slug>` to firm up the done-criteria probe, then re-run `/draft-plan <slug>`.

 - If the spec's frontmatter has no `done_criteria` field at all (legacy spec written before), warn once and continue:

 > Spec `<slug>` v<M> predates the done-criteria field. Continuing in legacy mode — the plan will not echo or verify done-criteria. Recommended: re-run `/spec <slug>` to add criteria; the next plan version will pick them up.

 - Capture the `done_criteria` list (or empty list in legacy mode) for use in steps 8, 9, and the final synthesis step.

4. **Resolve the output version.** Look at `.claude/plans/<slug>/`:
 - If empty / does not exist → write `v1.md`.
 - Else → write `v<N+1>.md` where N is the highest existing version. Mark previous active plan as `superseded` (frontmatter), with `superseded_by: v<N+1>.md`.

 No `--evolve` / `--new` distinction for plans. Plans are cheaper than specs and always evolve as a new version against the same slug. If the user wants a fresh plan tree under a new slug, that's a `/spec <new-slug> --new` operation upstream.

5. **Prep.** Invoke `skills/prep/SKILL.md` with the spec topic / task text. Architectural rules must be loaded before steps are drafted.

6. **Discover.**

 ```
 {
 task_keywords: [<derived from spec / task>],
 scopes: [<detected language>, <detected domain>, "global", "project-<name>"],
 kind: ["architectural-rule", "decision", "lesson", "project", "codemap"],
 top_n: 20,
 render_bodies: true,
 include_recaps: false
 }
 ```

 Use codemap to resolve concrete paths. Do not guess paths — Glob / Grep / Read the repo if codemap doesn't cover the area.

7. **Triviality check.** One-paragraph spec + one-step change + no architectural risk → ask:

 > This looks small enough to skip plan/execute. Anthropic's rule: if you can describe the diff in one sentence, just do it. Want to proceed anyway? (y/N)

 Stop unless the user confirms.

8. **Draft steps.** Each step has:
 - Concrete goal (one line).
 - Files (concrete paths — flag unknowns in Notes and stop).
 - Outcome (what is true after this step).
 - Verification (specific command, test, or check).
 - **Serves criteria:** list of done-criteria index numbers from the spec this step contributes to (e.g. `[1, 3]`). At least one criterion per step. A step that traces to no criterion is a planning smell — flag and ask the user:

 > Step N doesn't trace to any done-criterion. Either the criterion is missing from the spec (re-run `/spec <slug>`) or the step is unnecessary (drop it). Resolve before continuing.

 - Optional tags: `[research]`, `[delegate]`.

 **Skip the "Serves criteria" field in legacy mode** (spec had no `done_criteria`) — there's nothing to map to.

 The closing done-criteria assessment is **not** a plan step — it's post-loop infrastructure inside `/execute`, run after the last real step's verification passes. The plan declares what done means; execute checks it.

 The drafted plan is held **in-conversation** at this point — nothing is written to disk yet. The review gate (step 9) decides whether it lands.

9. **Review gate — present the plan and confirm before writing.** The plan is the last cheap checkpoint before `/execute` ("plan changes are cheap, implementation changes are not"). Do **not** write the file silently; present the drafted plan and ask the user how to proceed. Pick the presentation mode by plan size:

 - **Inline (default, small plans ≤ 6 steps).** Render the full plan body — Context, the Done-criteria echo, and every numbered step (goal / files / outcome / verification / serves-criteria) — in the conversation. Then ask: *accept / edit / reject*.
 - **Outline-first (large plans > 6 steps).** Render a compact outline — one line per step (`Step N: <goal> → serves [criteria]`) — then ask: *"Show the full plan inline, write it to disk for you to open, or edit a step? (accept / show / write / edit / reject)"*. Pull the full body inline only if the user asks for it.
 - **Ask-only (terse preference — `--quiet` flag, or a stored `preferences/`-tier verbosity preference).** A single prompt: *"Plan drafted: K steps, pinned to spec v<M>. Review inline, or write and open? (review / write / reject)"*. Honour the stated preference for minimal conversation while still **asking** rather than silently writing.

 Resolve the user's choice:

 - **accept** (or "write") → proceed to step 10 and write the file exactly as specified. The confirmed plan is what lands.
 - **edit** → the user describes changes in prose ("drop step 3", "swap 4 and 5", "step 2 should also touch `foo.ts`"). Apply them to the in-conversation draft, re-present per the same mode, and loop until accept or reject.
 - **reject** → discard the draft. Write nothing. Acknowledge (*"Plan discarded — nothing written."*) and stop.

 This is a gate on the **in-conversation draft**, not a second file. No `v<N>-draft.md` scratch file is created — only the confirmed plan becomes `v<N>.md`. The gate fires identically in degraded `--task` mode (arguably more important there, since there is no spec to fall back on). It mirrors the propose-confirm-commit flow recap / capture / rules / memory-audit already use.

10. **Write the plan file.** Path: `.claude/plans/<slug>/v<N>.md`. Reached only on **accept** in step 9.

 Frontmatter:

 ```yaml
 ---
 slug: <slug>
 version: <N>
 status: active
 spec:../../specs/<slug>/v<M>.md # pin to the spec version this plan is built against
 supersedes: v<N-1>.md # omit on v1
 created: YYYY-MM-DD
 description: <one-line — what this plan accomplishes>
 ---
 ```

 Body:

 ```markdown
 # Plan — <slug> (v<N>)
 Spec: <relative path to pinned spec version, or "no spec — task description below">
 Generated: YYYY-MM-DD

 ## Context
 <1–3 paragraphs from the spec or task text.>

 ## Done-criteria (from spec)
 <Echo the spec's done_criteria list verbatim, numbered. Each criterion gets a stable index that step "Serves criteria" lines reference. Skip this section entirely in legacy mode.>

 1. <criterion 1 verbatim>
 2. <criterion 2 verbatim>

 ## Step 1: <goal>
 - Files: <concrete paths>
 - Outcome: <what is true after this step>
 - Verification: <command or specific check>
 - Serves criteria: [<list of criterion indices, e.g. 1, 3>] ← skipped in legacy mode
 - Tags: [research] [delegate] ← optional

 ## Step 2: <goal>
...

 ## Notes
 - Architectural rules loaded: <names only>
 - Open risks: <list, or "none">
 ```

11. **Update previous active plan** (when N > 1):
 - Set `status: superseded` in `v<N-1>.md`.
 - Add `superseded_by: v<N>.md`.

12. **Update plans INDEX.** Path: `.claude/plans/INDEX.md`. Same shape as specs INDEX:

 ```markdown
 # Plans index

 | Slug | Current | Status | Spec | Created | Description | |------|---------|--------|------|---------|-------------| | <slug> | v<N> | active | v<M> | YYYY-MM-DD | <one-line> | ```

 Regenerated from frontmatter every invocation. Lazy create.

13. **Close.**

 > Wrote `.claude/plans/<slug>/v<N>.md` with K steps, pinned to spec v<M> (reviewed and accepted). Run `/execute <slug>` when ready.

 Optionally offer the blueprint step — user-confirmed, never automatic:

 > Want a concrete blueprint (intent + the mature shape — classes, interfaces, deps, build order) before coding? Run `/blueprint <slug>`.

 Offer it once, in the close only. Do not push it; `/blueprint` is a deliberate choice, and small plans rarely need it.

## Spec pinning

A plan's `spec:` frontmatter pins the exact spec version it was drafted against. If the spec evolves to a higher version after the plan is written, the plan does NOT silently update — it stays pinned. This is deliberate: a plan reflects decisions made against a specific spec snapshot. To rebuild the plan against a newer spec, run `/draft-plan <slug>` again, which produces a new plan version pinned to the new spec version.

## What /draft-plan does not do

- Does not implement anything.
- Does not run `/execute`.
- Does not modify spec files.
- Does not silently overwrite an existing plan version. Every write creates a new `v<N>.md`.
- Does not write the plan without confirmation. The review gate (step 9) presents the drafted plan and waits for *accept* before anything lands on disk — no silent write, no draft scratch file.

See also: [`docs/plan-execute-workflow.md`](../../docs/plan-execute-workflow.md).
