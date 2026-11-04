---
name: draft-plan
description: "Produce a versioned plan under `.claude/plans/<slug>/v<N>.md` from the active spec for that slug, pinned to a specific spec version and presented for review (accept / edit / reject) before it is written to disk. Use when the user types /draft-plan or asks to plan out the implementation of a specced feature. Mode A only — never auto-fires."
---

# draft-plan

Turn an active spec (or a `--task` description) into a versioned, stepped plan, pinned to the spec version it was drafted against. Between `/spec` and `/execute`.

## When to run

- `/draft-plan [<slug>] [--task "<text>"]`, or a request to plan out a specced feature, after `/spec` and before `/execute`.

Do **not** auto-fire. For a one-sentence change, the triviality check (step 7) will short-circuit and tell the user to just do it.

## Forms

- `/draft-plan` (no slug) — resolve in this order: (1) if `default` is active in `.claude/specs/INDEX.md`, use it; (2) else if exactly one named slug is active, use it; (3) else list active slugs and ask.
- `/draft-plan <slug>` — read `.claude/specs/<slug>/` active version, write `.claude/plans/<slug>/v<N>.md`.
- `/draft-plan <slug> --task "<text>"` — degraded mode: no spec required, the text is the input. Slug still required for the output path. Use `default` for the no-decision case.
- `--quiet` — terse review gate: one accept/edit/reject prompt instead of an inline or outline walkthrough (step 9). Combinable with any form above.
- `--cold` — run the cold read (step 8d) before the review gate. Also offered at the gate as `cold`.
- `--executor cheap` — **strict drafting mode.** Draft the plan for an executor that does not share this conversation and reasons less capably: every step self-contained, every judgment call closed at draft time (step 8b). Default is `--executor main` (this context executes; today's behaviour). Combinable with any form above.

## Procedure

1. **Locate the trees.** `$CLAUDE_PROJECT_DIR/.claude/specs/` and `.claude/plans/` (cwd fallback if env var unset). Lazy mkdir.

2. **Resolve the slug.**
   - Slug given → use it; no slug → the order under Forms.
   - No slug, no specs → only valid with `--task` (which itself requires an explicit slug); otherwise stop with: *"No specs and no task description. Run `/spec` first or pass `<slug> --task`."*
   - **Stale INDEX** — INDEX.md names an active version whose file is missing on disk → stop with: *"INDEX.md points at `<path>` but the file is missing. Reconcile by re-running `/spec <slug>`, or pass an explicit path."*

3. **Resolve the input.**
   - Default: read the active version file (`.claude/specs/<slug>/v<M>.md` where M = active version per INDEX).
   - With `--task`: use the task text. Warn: *"No spec — running in degraded mode. For non-trivial work, run `/spec <slug>` first."*

   **Done-criteria gate** (default mode only — skipped with `--task` since no spec exists):
   - If the spec's frontmatter `done_criteria_provisional: true`, refuse to plan:

     > Spec `<slug>` v<M> has provisional done-criteria. Re-run `/spec <slug>` to firm them up, then `/draft-plan <slug>`.

   - If the spec's `## Open questions` has any line tagged `blocks: plan`, refuse to plan and list those lines:

     > Spec `<slug>` v<M> has open questions that block the plan: <list>. Settle them with `/spec <slug>` (or `/spec <slug> --questionnaire` when someone else holds the answer), then re-run `/draft-plan <slug>`.

   - If the spec's frontmatter has no `done_criteria` field at all (a legacy spec predating done-criteria), warn once and continue:

     > Spec `<slug>` v<M> predates done-criteria. Continuing in legacy mode: the plan won't echo or verify them. Re-run `/spec <slug>` to add them.

   - Capture the `done_criteria` list (or empty list in legacy mode) for use in steps 8, 9, and the final synthesis step.

4. **Resolve the output version.** Look at `.claude/plans/<slug>/`:
   - If empty / does not exist → write `v1.md`.
   - Else → write `v<N+1>.md` where N is the highest existing version, and supersede the previous active plan per step 11.

   Plans always evolve as a new version of the same slug; a fresh tree means `/spec <new-slug> --new` upstream.

5. **Prep.** Invoke `skills/prep/SKILL.md` with the spec topic / task text. Architectural rules must be loaded before steps are drafted.

   **Autonomy contract** (optional): if none is set (no `active.md`, no kickoff from `/spec`), you may ask one question — push to all criteria or MVP-and-stop, interrupt every step or only on forks — and record it with [autonomize](../autonomize/SKILL.md). Skip when the default obviously fits or the user prefers terse runs. Never a gate.

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

   > This looks small enough to skip plan/execute: if you can describe the diff in one sentence, just do it. Plan anyway? (y/N)

   Stop unless the user confirms.

8. **Draft steps.** Each step has:
   - Concrete goal (one line).
   - Files (concrete paths — flag unknowns in Notes and stop).
   - Outcome (what is true after this step).
   - Verification (specific command, test, or check).
   - **Builds on:** what the step uses instead of new code, first that fits: code already in this repo (`path:line`), the standard library or platform, an installed dependency, or `new code: <why none of these fits>`. Grep or check the codemap before writing it; a guessed path is not reuse. Adding a dependency needs its own reason.
   - **Smaller option** (only when one exists): when the step builds more than its criteria need (an option, abstraction, config or extra case nobody asked for), one line naming the smaller version. The user picks at the gate; never choose silently either way.
   - **Serves criteria:** list of done-criteria index numbers from the spec this step contributes to (e.g. `[1, 3]`). At least one criterion per step. A step that traces to no criterion is a planning smell — flag and ask the user:

     > Step N traces to no done-criterion: the spec is missing one (re-run `/spec <slug>`) or the step is unnecessary (drop it).

   - Optional tags: `[research]`, `[delegate]`.

   Skip "Serves criteria" in legacy mode (no `done_criteria`).

   **Self-containment for delegated steps.** When a step is tagged `[delegate]` (or otherwise destined for a fresh subagent — see execute §3b), the executing agent does **not** share this conversation's context and cannot re-derive it. Such a step needs two extra fields so it stands alone:

   - **Current state:** the relevant *before* excerpt of what the step modifies — the actual code/config lines being changed (a few lines, cited `file:line`), not a paraphrase. For a new-file step, state "new file" and the directory it lands in.
   - **Exemplar:** a concrete path in the repo to follow as the convention anchor (e.g. *"mirror the structure of `src/services/auth-service.ts`"*). The subagent reads it to match local idiom instead of inventing one.

   Populate both only for `[delegate]` steps; on in-context steps they are noise. If you can't supply them, Read the repo to fill them in or drop the `[delegate]` tag. Never delegate a step the plan can't make self-contained.

   Don't add a final "check done-criteria" step: `/execute` runs that assessment itself.

8b. **Strict drafting mode (`--executor cheap` only).** Read [strict-mode.md](strict-mode.md) first. In short: every step carries Current state and Exemplar, every judgment call is closed in the step text, and every command is spelled out. Say the cost at the gate; on a judgment-heavy plan, say so once and let the user decide.

8c. **Classify each step: `[mechanical]` or `[judgment]`.** In strict mode every step carries exactly one of these tags; in `main` mode they are optional and purely informational. The tag is what `/execute` reads to decide where a step runs, so classify by what the step *needs*, never by its size:

   - **`[mechanical]`** — the step is fully determined by the plan text plus its exemplar. Renames, scaffolding from a pattern, config edits, boilerplate, porting an existing shape to a new file. Two readers following the step would produce the same diff.
   - **`[judgment]`** — the step contains something the plan could not close: a design decision, an ambiguous requirement, an unknown that must be discovered while working. Always runs in the main context.

   **The verification-shape gate (hard rule).** A step may carry `[mechanical]` **only if its Verification is command-shaped**, or artifact-shaped with the exact check written out (the literal Grep/Read, not "confirm the function exists"). User-attested verification never qualifies.

   Mechanical but user-attested? Tag it `[judgment]`; never weaken the verification to fit the tag. Why: [strict-mode.md](strict-mode.md).

   The drafted plan is held **in-conversation** at this point — nothing is written to disk yet. The review gate (step 9) decides whether it lands.

8d. **Cold read (`--cold`, or `cold` at the gate).** Three [`cold-reader`](../../agents/cold-reader.md) agents in one message, lenses `comprehension`, `readiness`, `reuse`, each given only the plan text, the repo root and its lens. Procedure (sorting, showing, applying, cost): [cold-read.md](cold-read.md). No Agent tool → say it did not run; never role-play it.

9. **Review gate — present the plan and confirm before writing.** The plan is the last cheap checkpoint before `/execute` ("plan changes are cheap, implementation changes are not"). Do **not** write the file silently; present the drafted plan and ask the user how to proceed. For a non-trivial plan, offer a [human-view](../human-view/SKILL.md) projection alongside — *"want the plain-prose approval view? (/human-view)"* — so approval reads the decisions, not the artefact format. Pick the presentation mode by plan size:

   - **Inline (default, small plans ≤ 6 steps).** Render the full plan body — Context, the Done-criteria echo, and every numbered step (goal / files / outcome / verification / serves-criteria) — in the conversation. Then ask: *accept / edit / cold / reject*.
   - **Outline-first (large plans > 6 steps).** Render a compact outline — one line per step (`Step N: <goal>  → serves [criteria]`) — then ask: *"Show the full plan inline, write it to disk for you to open, or edit a step? (accept / show / write / edit / cold / reject)"*. Pull the full body inline only if the user asks for it.
   - **Ask-only (terse preference — `--quiet` flag, or a stored `preferences/`-tier verbosity preference).** A single prompt: *"Plan drafted: K steps, pinned to spec v<M>. Review inline, or write and open? (review / write / reject)"*. Honour the stated preference for minimal conversation while still **asking** rather than silently writing.

   Before asking, list every step's **Smaller option** line together, so the user can take or refuse each one (`take 2`, `keep all`). Skip when there are none.

   Resolve the user's choice:

   - **accept** (or "write") → proceed to step 10 and write the file exactly as specified. The confirmed plan is what lands.
   - **edit** → the user describes changes in prose ("drop step 3", "swap 4 and 5", "step 2 should also touch `foo.ts`"). Apply them to the in-conversation draft, re-present per the same mode, and loop until accept or reject.
   - **cold** → run the cold read (step 8d), then re-present.
   - **reject** → discard the draft. Write nothing. Acknowledge (*"Plan discarded — nothing written."*) and stop.

   The gate works on the in-conversation draft: no scratch file, and only the confirmed plan becomes `v<N>.md`. It fires the same in `--task` mode.

10. **Write the plan file.** Path: `.claude/plans/<slug>/v<N>.md`. Reached only on **accept** in step 9.

   Use the frontmatter and body template in [templates.md](templates.md): `spec:` pins the spec version, `executor: cheap` only in strict mode, Done-criteria echoed verbatim and numbered, and each step's fields as drafted in step 8. **`--task` plans:** `spec: none — task description in Context`; such a plan is exempt from the stale-pin check and the done-criteria echo.

11. **Update previous active plan** (when N > 1). Versioning follows spec's canonical contract ([spec SKILL.md § Versioning contract](../spec/SKILL.md)): mark the previous version superseded with a `superseded_by` pointer and regenerate the INDEX.

12. **Update plans INDEX.** Path: `.claude/plans/INDEX.md`. Same shape as specs INDEX:

    ```markdown
    # Plans index

    | Slug | Current | Status | Spec | Created | Description |
    |------|---------|--------|------|---------|-------------|
    | <slug> | v<N> | active | v<M> | YYYY-MM-DD | <one-line> |
    ```

    Regenerated from frontmatter every invocation. Lazy create.

13. **Close.**

    > Wrote `.claude/plans/<slug>/v<N>.md` with K steps, pinned to spec v<M> (reviewed and accepted). Run `/execute <slug>` when ready.

    Optionally offer the blueprint step — user-confirmed, never automatic:

    > Want a concrete blueprint (intent + the mature shape — classes, interfaces, deps, build order) before coding? Run `/blueprint <slug>`.

    Offer it once, in the close only. Do not push it; `/blueprint` is a deliberate choice, and small plans rarely need it.

    **Changelog:** offer *"Drafted the &lt;slug&gt; plan — log a decision line to CHANGELOG? (y/N)"* only for a new plan (v1), never for a v→v+1 re-draft. On `y`, invoke [`update-changelog`](../update-changelog/SKILL.md).

Spec pinning, what /draft-plan does not do, and the workflow doc: [reference.md](reference.md).
