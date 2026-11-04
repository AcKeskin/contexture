---
name: spec
description: Interview the user in detail using AskUserQuestion, then write a versioned spec under `.claude/specs/<slug>/`. Specs evolve via versioned files (v1, v2, …); INDEX.md tracks the active version per slug. Use when the user types /spec, or asks to spec out / write requirements for a non-trivial feature before building. Mode A only — never auto-fires.
---

# spec

Run the `spec` flow — interview-driven requirements capture that lands a versioned spec file. Upstream of `/draft-plan`; downstream of `/envision`. Every non-trivial feature gets a spec before a plan is drafted against it.

## When to run

- User types `/spec`, `/spec <slug>`, `/spec <slug> --new`, or `/spec <slug> --abandon`.
- User asks to "spec out", "write requirements for", "nail down what we're building" for a non-trivial feature.
- Before `/draft-plan` on any feature whose requirements aren't already pinned in a spec.

Do **not** auto-fire. Do **not** run for one-line fixes, refactors, or tasks with no requirements to surface — that's `/draft-plan --task` territory or just doing the work.

## Forms

- `/spec` — write to the reserved `default` slug. Use this when the project itself is the scope (one-off small projects, single-feature work). On evolution, the existing `default` spec evolves like any other.
- `/spec <slug>` — named slug. Use when a project hosts parallel specs (`auth-rework`, `billing`, …). If the slug exists in `.claude/specs/INDEX.md`, evolve the active version (interview on diffs, write `v_n+1`, mark old version `superseded`). If new, create `v1.md` under it.
- `/spec <slug> --new` — explicit fresh slug. Refuse and stop if `<slug>` already exists in INDEX. For genuine forks where the existing spec keeps living.
- `--cold` — before writing, have no-context agents read the drafted spec (step 6.5). Combinable with the create and evolve forms.
- `/spec <slug> --questionnaire [<recipient>]` — write a questionnaire for the active spec's open questions that someone other than the user must answer (step 7.5). No new spec version.
- `/spec <slug> --abandon` — mark the active version `abandoned` in both file frontmatter and INDEX. No new file written. Confirms before writing.

`default` is a reserved slug — it is treated like any other slug structurally (folder, INDEX row, frontmatter), the only difference is the no-arg form resolves to it. Mixing `default` with named slugs in the same project is supported.

## Procedure

1. **Locate the specs tree.** Resolve `$CLAUDE_PROJECT_DIR/.claude/specs/` (or `cwd/.claude/specs/` if env var unset). Create the directory tree lazily — do not pre-create empty folders.

2. **Legacy migration check (one-time).** If a root `SPEC.md` exists and `.claude/specs/` does not, offer to migrate it; procedure in [reference.md](reference.md).

3. **Resolve the slug.**
   - `/spec` (no args) → use the reserved slug `default`. No prompt; the user opted into the no-decision path.
   - `/spec <slug>` → validate against `^[a-z0-9][a-z0-9-]*$`; reject anything else with one re-prompt. `default` is allowed but redundant — it's the no-arg form's target.

4. **Decide create vs evolve vs abandon.**
   - `--abandon` flag → go to step 9 (abandon flow).
   - `--new` flag + slug already in INDEX → stop:

     > Slug `<slug>` already exists with active version v<N>. Drop `--new` to evolve it, or pick a different slug.

   - Slug not in INDEX → **create flow**: this will be `v1.md`.
   - Slug in INDEX with active version → **evolve flow**: read the active file, interview only on what's changing, write `v_n+1`.

4.5 **Prior-art pass** (port or parity work only). When the user frames the work against something that exists ("like X but for Y", "port", "parity with") or the interview surfaces a sibling already built, read [prior-art.md](prior-art.md) and run it before step 5: locate candidate bases (codemap first), have the user confirm the canonical one, surface drift between candidates as a question, and never sweep other projects unasked. No trigger, no pass.

5. **Interview** (`AskUserQuestion`, fall back to plain text if unavailable):
   - **Create flow** — full interview. Probe technical implementation, UI/UX, edge cases, constraints, tradeoffs, concerns. Skip obvious questions. Stop when the user signals done, coverage is complete, or after ~10 questions ask the meta-question *"I've asked 10 questions. Are there areas we haven't covered that matter?"* and respect the answer.
   - **Create flow with a confirmed base** — interview on the delta, not from zero, and always ask the shared-core question (port vs. extract a common core). Procedure: [prior-art.md](prior-art.md), *Delta interview*.
   - **Evolve flow** — first read any filled questionnaire in `.claude/specs/<slug>/` (step 7.5): each answer settles its open question, and the answer goes in the section it settles. Then open the active version, summarise its current shape in 3–5 bullets, then ask: *"What's changing? (paragraphs / sections to revise, or 'all of it' for a full re-interview)"*. Interview only on the deltas. Sections the user does not touch are carried forward verbatim from the previous version.
   - **Done-criteria probe** (closing phase, both flows) — after the body sections are populated, propose 2–4 candidate done-criteria derived from the spec body and ask the user to accept/edit/add. Each criterion must be: (a) **falsifiable** ("done when X works" is too vague; "done when running command Y produces output Z" is good), (b) **observable from outside the implementation** (a fresh reader can check it against the artefact), (c) **sufficient together** (if all are met, the spec's intent is satisfied). Iterate until the user signals done. Minimum: one criterion. **Nudge toward at least one command-shaped criterion** (one a command can settle, rather than a reader's judgment) — that is the kind `/execute`'s closing assessment can check on its own, and asking for it during the interview costs nothing. Advisory, not a gate: a spec whose intent is genuinely all judgment still ships with judgment criteria. **With a confirmed base, prefer parity-shaped criteria** — *"behaviours 1–7 of the base inventory hold on `<target>`"* is falsifiable, cheap to write, and often command-shaped already where the base carries tests. If the user can't articulate any falsifiable criterion ("we'll figure it out as we go"), mark the spec `status: draft` with `done_criteria_provisional: true` in frontmatter — this blocks `/draft-plan` until the criteria are firm. Drafts are still useful; the block is on promotion to `active`, not on writing the spec.
   - **Open-questions sort** (closing phase, both flows) — list what is still unresolved and sort each item:
     - **Open question** — you can state it precisely now, even if nobody can answer it yet. Tag who answers it (`user`, `research`, or a person or role) and what it blocks (`plan`, `build`, `none`). A question the user can answer and that blocks the plan gets asked now, not recorded. A `research` question that blocks the plan gets a bounded look now (docs, the repo) before it is recorded.
     - **Not yet specified** — you can tell it is coming but can't phrase it as a precise question yet. Write it as loosely as you see it. It is in scope; it becomes an open question once an answer upstream makes it sharp.
     - **Non-goal** — it lies beyond the goal. It goes under Non-goals and never comes back as a question.

     The test between the first two is whether you can state the question precisely, not whether you can answer it. A spec with any open question tagged `blocks: plan` is written `status: draft`; `/draft-plan` refuses it until the question is settled. When the answerer is someone else, offer the questionnaire (step 7.5).
   - **Autonomy-contract probe** (closing phase, optional) — once the work's shape is clear, optionally ask *one* question: *"How autonomous should the build be — push hard to all criteria, or MVP-and-stop? Interrupt on every step, or only real forks?"* and call [autonomize](../autonomize/SKILL.md) as a library to record the answer as the per-task kickoff contract. **Skip it** when the implicit default (balanced / criteria-met / forks-only) obviously fits, or the user gave a terse preference — this is one optional question, never a mandatory gate. It is the *implicit surface* of autonomize's kickoff mode: the explicit `/autonomize` command stays available independently.

6. **Ground the spec.** Invoke `skills/discover/SKILL.md`:

   ```
   {
     task_keywords: [<keywords from subject + interview answers>],
     scopes: [<detected language>, <detected domain>, "global"],
     kind: ["architectural-rule", "decision", "lesson", "project"],
     top_n: 15,
     render_bodies: true,
     include_recaps: false
   }
   ```

   Fold relevant prior knowledge into the spec's `Grounded context` section. Cite by name; do not silently absorb.

   With a confirmed base, run the anchoring guard in [prior-art.md](prior-art.md): flag a known defect in the base instead of porting it.

6.5 **Cold read (`--cold` only).** Before writing, run [draft-plan's cold read](../draft-plan/cold-read.md) on the drafted spec with two lenses: `comprehension` and `reuse`. Readiness is for plans. Apply the fixes the user accepts, then write.

7. **Write the new version file.** Path: `.claude/specs/<slug>/v<N>.md` where `N` = previous active version + 1, or `1` for create flow.

   Use the frontmatter and body template in [templates.md](templates.md). Frontmatter is mandatory: `slug`, `version`, `status`, `supersedes` (omit on v1), `created`, `description`, `done_criteria`, `done_criteria_provisional`. Body sections: Problem, Goals, Non-goals, User-facing behavior, Base implementation (only with a confirmed base), Technical approach, Constraints, Grounded context, Open questions (`· answers: … · blocks: …`), Not yet specified, Verification criteria, Changes from v<N-1> (evolve only). Sections with no content → write *"not addressed during interview"*. Do not invent.

7.5 **Questionnaire** (an open question someone else must answer, or `--questionnaire`). The user can't answer it, so ask the user only about the send: who it goes to (role, what they know that the user doesn't) and anything they need back beyond the open questions. One exchange. Then write `.claude/specs/<slug>/questionnaire-<recipient>.md`:

   Use the questionnaire template in [templates.md](templates.md).

   Every open question with this answerer gets a question; each question asks one thing. Tell the user the path. The next `/spec <slug>` reads the filled file first (evolve flow).

8. **Update the previous active version's frontmatter** (evolve flow only):
   - Set `status: superseded` in `v<N-1>.md`.
   - Add `superseded_by: v<N>.md`.
   - Do not modify the body. Old versions are read-only after supersession.

9. **Abandon flow** (when `--abandon` was passed):
   - Confirm: *"Mark `<slug>` v<N> abandoned? Status is irreversible without manual edit. (y/N)"*
   - On `y`: update the active version's frontmatter to `status: abandoned`, update INDEX. Do not write a new file.
   - On `n`: stop without changes.

10. **Update INDEX.md.** Path: `.claude/specs/INDEX.md`. Format:

    ```markdown
    # Specs index

    | Slug | Current | Status | Created | Description |
    |------|---------|--------|---------|-------------|
    | <slug> | v<N> | active | YYYY-MM-DD | <one-line from frontmatter> |
    ```

    One row per slug. The `Current` column points at the latest non-abandoned version (active or — if all are superseded, which shouldn't happen — the highest). Sort rows by `Created` descending. Create the file lazily on first spec.

    INDEX is regenerated from frontmatter on every `/spec` invocation — do not hand-edit. If the file drifts from the on-disk frontmatter, the next `/spec` reconciles it.

11. **Close.** Tell the user:

    > Wrote `.claude/specs/<slug>/v<N>.md`. INDEX updated. Recommended: start a fresh session before `/draft-plan <slug>` — Claude's context is cleanest when each phase begins clean.

    **Offer a changelog decision line — significant changes only.** A *new* spec for a slug (v1) or a status transition (a spec going `active`, or `--abandon`) is a significant planning-artifact change worth recording: offer *"Spec'd &lt;slug&gt; — log a decision line to CHANGELOG? (y/N)"*. On `y`, invoke [`update-changelog`](../update-changelog/SKILL.md) (it composes a `◆` decision line behind its own accept/edit/reject gate). **Do not offer on a routine v→v+1 wording revision** — that is authoring churn, already tracked by the version chain + INDEX (changelog-contract §5). spec is a *doorway*, not the writer; the propose-confirm gate is the backstop if the change turns out not changelog-worthy.

The versioning contract, done-criteria semantics and what /spec does not do: [reference.md](reference.md).
