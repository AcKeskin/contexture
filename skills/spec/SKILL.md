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
- `/spec <slug> --abandon` — mark the active version `abandoned` in both file frontmatter and INDEX. No new file written. Confirms before writing.

`default` is a reserved slug — it is treated like any other slug structurally (folder, INDEX row, frontmatter), the only difference is the no-arg form resolves to it. Mixing `default` with named slugs in the same project is supported.

## Procedure

1. **Locate the specs tree.** Resolve `$CLAUDE_PROJECT_DIR/.claude/specs/` (or `cwd/.claude/specs/` if env var unset). Create the directory tree lazily — do not pre-create empty folders.

2. **Legacy migration check (one-time).** If `$CLAUDE_PROJECT_DIR/SPEC.md` exists at project root and `.claude/specs/` does not yet exist, ask:

 > Found a legacy SPEC.md at the project root. Migrate it to `.claude/specs/<slug>/v1.md` and create INDEX.md? (y/N)

 On `y`: derive the slug from the file's `# Spec — <slug>` heading (or ask if absent), move the content into `v1.md` with the new frontmatter (status `active`), build `.claude/specs/INDEX.md`. The old `SPEC.md` is deleted only after the new files are written successfully. On `n`: leave the legacy file alone; treat the new flow as additive (`/spec` will write to `.claude/specs/` regardless).

3. **Resolve the slug.**
 - `/spec` (no args) → use the reserved slug `default`. No prompt; the user opted into the no-decision path.
 - `/spec <slug>` → validate against `^[a-z0-9][a-z0-9-]*$`; reject anything else with one re-prompt. `default` is allowed but redundant — it's the no-arg form's target.

4. **Decide create vs evolve vs abandon.**
 - `--abandon` flag → go to step 9 (abandon flow).
 - `--new` flag + slug already in INDEX → stop:

 > Slug `<slug>` already exists with active version v<N>. Drop `--new` to evolve it, or pick a different slug.

 - Slug not in INDEX → **create flow**: this will be `v1.md`.
 - Slug in INDEX with active version → **evolve flow**: read the active file, interview only on what's changing, write `v_n+1`.

5. **Interview** (`AskUserQuestion`, fall back to plain text if unavailable):
 - **Create flow** — full interview. Probe technical implementation, UI/UX, edge cases, constraints, tradeoffs, concerns. Skip obvious questions. Stop when the user signals done, coverage is complete, or after ~10 questions ask the meta-question *"I've asked 10 questions. Are there areas we haven't covered that matter?"* and respect the answer.
 - **Evolve flow** — open the active version, summarise its current shape in 3–5 bullets, then ask: *"What's changing? (paragraphs / sections to revise, or 'all of it' for a full re-interview)"*. Interview only on the deltas. Sections the user does not touch are carried forward verbatim from the previous version.
 - **Done-criteria probe** (closing phase, both flows) — after the body sections are populated, propose 2–4 candidate done-criteria derived from the spec body and ask the user to accept/edit/add. Each criterion must be: (a) **falsifiable** ("done when X works" is too vague; "done when running command Y produces output Z" is good), (b) **observable from outside the implementation** (a fresh reader can check it against the artefact), (c) **sufficient together** (if all are met, the spec's intent is satisfied). Iterate until the user signals done. Minimum: one criterion. If the user can't articulate any falsifiable criterion ("we'll figure it out as we go"), mark the spec `status: draft` with `done_criteria_provisional: true` in frontmatter — this blocks `/draft-plan` until the criteria are firm. Drafts are still useful; the block is on promotion to `active`, not on writing the spec.
 - **Autonomy-contract probe** (closing phase, optional —) — once the work's shape is clear, optionally ask *one* question: *"How autonomous should the build be — push hard to all criteria, or MVP-and-stop? Interrupt on every step, or only real forks?"* and call [autonomize](../autonomize/SKILL.md) as a library to record the answer as the per-task kickoff contract. **Skip it** when the implicit default (balanced / criteria-met / forks-only) obviously fits, or the user gave a terse preference — this is one optional question, never a mandatory gate. It is the *implicit surface* of autonomize's kickoff mode: the explicit `/autonomize` command stays available independently.

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

7. **Write the new version file.** Path: `.claude/specs/<slug>/v<N>.md` where `N` = previous active version + 1, or `1` for create flow.

 Frontmatter (mandatory):

 ```yaml
 ---
 slug: <slug>
 version: <N>
 status: active
 supersedes: v<N-1>.md # null on v1 — omit the line entirely
 created: YYYY-MM-DD
 description: <one-line — what this spec is about, used by INDEX>
 done_criteria:
 - "<falsifiable, observable condition 1>"
 - "<falsifiable, observable condition 2>"
 done_criteria_provisional: false # set true (with status: draft) only if step 5 yielded no firm criteria
 ---
 ```

 Body shape (unchanged from v1 of the workflow):

 ```markdown
 # Spec — <slug> (v<N>)

 ## Problem
 <what forces this work. 1–2 paragraphs.>

 ## Goals
 - <bullet>

 ## Non-goals
 - <bullet>

 ## User-facing behavior
 <from interview.>

 ## Technical approach
 <from interview.>

 ## Constraints
 <deadlines, perf targets, dependencies.>

 ## Grounded context
 <loaded rules / decisions / lessons. Cite by name.>

 ## Open questions
 - <unresolved>

 ## Verification criteria
 <how shipped work will be judged. Specific.>

 ## Changes from v<N-1> ← evolve flow only
 - <bullet per section that changed, with one-line summary>
 ```

 Sections with no content → write *"not addressed during interview"*. Do not invent.

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

 | Slug | Current | Status | Created | Description | |------|---------|--------|---------|-------------| | <slug> | v<N> | active | YYYY-MM-DD | <one-line from frontmatter> | ```

 One row per slug. The `Current` column points at the latest non-abandoned version (active or — if all are superseded, which shouldn't happen — the highest). Sort rows by `Created` descending. Create the file lazily on first spec.

 INDEX is regenerated from frontmatter on every `/spec` invocation — do not hand-edit. If the file drifts from the on-disk frontmatter, the next `/spec` reconciles it.

11. **Close.** Tell the user:

 > Wrote `.claude/specs/<slug>/v<N>.md`. INDEX updated. Recommended: start a fresh session before `/draft-plan <slug>` — Claude's context is cleanest when each phase begins clean.

 **Offer a changelog decision line — significant changes only.** A *new* spec for a slug (v1) or a status transition (a spec going `active`, or `--abandon`) is a significant planning-artifact change worth recording: offer *"Spec'd &lt;slug&gt; — log a decision line to CHANGELOG? (y/N)"*. On `y`, invoke [`update-changelog`](../update-changelog/SKILL.md) (it composes a `◆` decision line behind its own accept/edit/reject gate). **Do not offer on a routine v→v+1 wording revision** — that is authoring churn, already tracked by the version chain + INDEX (changelog-contract §5). spec is a *doorway*, not the writer; the propose-confirm gate is the backstop if the change turns out not changelog-worthy.

## Frontmatter rules (the versioning contract)

- `version` is monotonic per slug. Never reused, never decremented.
- `status` transitions: `draft → active → superseded` (normal evolution) or `* → abandoned` (explicit dead-end).
- Exactly one version per slug carries `status: active` at any time. Evolve flow enforces this.
- `supersedes` is the relative filename of the immediate predecessor. `superseded_by` is the inverse, written when the next version takes over.
- `created` is the date the version was written. Never edited after creation.
- `description` is one line, used by INDEX. Edit it freely as the spec evolves.
- `done_criteria` is a list of falsifiable / observable / sufficient conditions, populated during the interview's done-criteria probe. **Mandatory for `status: active`** — the spec cannot be promoted to active with an empty list. New versions of an existing spec must populate `done_criteria` (lazy migration at the natural inflection point).
- `done_criteria_provisional` defaults to `false`. Set `true` (with `status: draft`) when the interview yielded no firm criteria — blocks `/draft-plan` until resolved. Existing specs without `done_criteria:` are tolerated as legacy; `/spec` warns when reading them and offers to add criteria.

## Done-criteria semantics

The `done_criteria` list is the **machine-checkable** companion to the body's `## Verification criteria` section. The body section is the human-readable expansion (with examples, rationale, edge cases); the frontmatter list is the bulleted assertion set that downstream skills (`/draft-plan`, `/execute`) consume mechanically. They populate together during the interview.

Three rules on what counts as a criterion:

1. **Falsifiable.** "Done when X works" is too vague. "Done when running command Y produces output Z" is good. The user (or Claude) can read the criterion after implementation and answer "yes, met" or "no, not met" without ambiguity.
2. **Observable from outside the implementation.** A criterion that requires reading the implementer's mind ("done when the design feels right") is not a criterion. A criterion that can be checked by a fresh reader against the artefact is.
3. **Sufficient.** The criteria together must mean: if all are met, the spec's intent is satisfied. Missing criteria = under-specified spec — exactly what the done-criteria probe is designed to surface.

Source:.

## What /spec does not do

- Does not implement anything.
- Does not run `/draft-plan` or `/execute`.
- Does not modify code files — only writes under `.claude/specs/` and updates INDEX.md there.
- Does not silently overwrite an existing version. Every write either creates a new `v<N>.md` or transitions an existing file's frontmatter explicitly.
- Does not delete superseded or abandoned versions. They are kept for archaeology.

See also: [`docs/plan-execute-workflow.md`](../../docs/plan-execute-workflow.md) for the full four-phase chain and the file-tree convention.
