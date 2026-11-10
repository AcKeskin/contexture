---
name: execute
description: "Run a plan step-by-step with verification gates, honoring the autonomy contract — never advances silently past a failure. Use when a drafted plan is ready to implement. User-invoked: /execute [slug | path] [--from N] [--strategy sequential|subtask|multi-agent]. Never auto-fires."
---

# execute

The execute organ. Consumes [prep](../prep/SKILL.md) for per-step rule re-load on boundary crossings; consumes [discover](../discover/SKILL.md) indirectly via prep.

Execute is the implementation phase of the `spec → plan → execute → review → close-out` workflow. It runs a plan step-by-step with verification gates. It does not plan, does not draft, does not commit.

## When to run

**Manual only.** User invokes `/execute [slug | path] [--from N]`.

**Do not auto-fire:**
- Not at session start.
- Not after `/draft-plan` finishes — the user must review the plan first.
- Not on any hook — this skill implements code changes, that's always user-initiated.

## Inputs

- **Plan resolution.** One of:
  - **Slug** (`/execute <slug>`) — resolve to `.claude/plans/<slug>/v<N>.md` where N is the active version per `.claude/plans/INDEX.md`.
  - **No argument** — resolve against `.claude/plans/INDEX.md` per draft-plan's canonical slug-resolution cascade ([draft-plan SKILL.md § Forms](../draft-plan/SKILL.md)): `default` if active, else the single active slug, else list active slugs and ask.
  - **Explicit path** (`/execute <path>`) — use the path verbatim. Required when targeting a non-active version.
  - **Legacy fallback** — if no slug / path resolves AND `$CLAUDE_PROJECT_DIR/PLAN.md` exists at project root, use it with a one-time deprecation note: *"Reading legacy PLAN.md at project root — new plans go under `.claude/plans/<slug>/v<N>.md`. Run `/draft-plan <slug>` to migrate."*
- **Starting step.** Default: 1. Override via `--from N` — skips steps 1..N-1 (assumes they were done outside the skill).
- **User confirmation on delegation prompts and on verification failures.** Collaborator principle — no silent choices.

## Procedure

### 1. Load the plan

Resolve the plan file per the input rules above. Bail if no plan resolves:

> No plan found. Run /draft-plan <slug> first, or pass an explicit path: /execute <path>.

When multiple active plans exist and no slug was given, list them and stop:

> Multiple active plans: <slug1>, <slug2>, … . Re-run with /execute <slug>.

When the resolved file does not exist on disk (INDEX is stale):

> INDEX.md points at <path> but the file is missing. Reconcile by re-running /draft-plan <slug>, or pass an explicit path.

Parse steps by scanning for `## Step N: <goal>` headings. For each step, capture:
- Step number (parsed from the heading).
- Goal (text after the colon).
- Files (from the `- Files:` line).
- Outcome (from `- Outcome:` line).
- Verification (from `- Verification:` line).
- Tags (from `- Tags:` line, if present).
- Current state (from `- Current state:` line, if present — `[delegate]` steps carry it).
- Exemplar (from `- Exemplar:` line, if present — `[delegate]` steps carry it).

If parsing produces zero steps, stop:

> The plan file has no recognisable steps. Expected '## Step N: <goal>' headings. Fix the plan or re-run /draft-plan.

If a step is missing a verification line, stop:

> Step N has no verification. Execute will not advance blind. Add a Verification line to the plan.

Anchoring on verification is deliberate — that's the discipline this skill enforces.

### 2. Respect --from

If the user invoked `/execute --from N`, skip steps 1 to N-1 without executing them. Emit one line:

> Starting from step N (skipped steps 1..N-1).

The skipped steps are assumed done — execute does not verify them. The user has taken responsibility.

### 2.5 Choose execution strategy

Before the step loop, pick *how* to run — the **method** is the engineer's choice here; the **interrupt cadence** is read from the autonomy contract ([autonomize](../autonomize/SKILL.md)), not resolved separately. Default = **sequential** method + the contract's `ask` posture (which defaults to `forks-only`) when nothing is specified. Announce the chosen method + the contract-derived cadence in one line before the loop.

**Method** (`--strategy`) — execute's own concern (how to run — not an autonomy question):
- **sequential** (default) — run the steps in order in this context, one at a time (§3). Right for most plans; preserves the verification-gated discipline.
- **subtask** — decompose a plan with a few independent step-groups into in-context subtasks, single-context. Right when groups are independent but isolation isn't needed.
- **multi-agent** — when the steps are genuinely parallel-safe and heavy, **hand off to `/orchestrate`** (which owns decompose / place / dispatch / converge under the subagent recursion caps). Execute does *not* re-implement dispatch — it routes. Refuse multi-agent for a sequential chain (orchestrate refuses it too).

**Interrupt cadence** comes from the autonomy contract's `ask` field, never decided here. Resolve the effective contract `live > kickoff > inferred > default > implicit-default` (see [autonomize](../autonomize/SKILL.md)): **forks-only** confirms failures, delegations and forks; **every-step** confirms each consequential step; **until-blocked** runs until blocked. The loop applies it at 3b and 3d/3e. With no contract to resolve, use `forks-only`; execute never blocks on it.

### 3. For each step

#### 3a. Boundary-crossing re-prep

If this step's files belong to a different *module / language / domain* than the previous step's files, invoke `skills/prep/SKILL.md` with the step's goal as task context. Task-shift detection is the same rule as prep's auto-fire: different subtree root, different language, different domain tag.

First step always triggers prep (no previous step to compare against).

#### 3b. Delegation and routing

A step tagged `[mechanical]`, `[delegate]` or `[research]` may run outside this context. Before routing it, read [delegation.md](delegation.md): the two criteria (self-contained, mechanically verifiable), the cheap-tier rule, the delegation prompt and its self-containment gate, and the precondition check. Untagged and `[judgment]` steps run here.

#### 3c. Implement

Apply the described changes. Use Edit / Write / Bash / whatever the step requires. The plan's Files and Outcome lines are the contract — if the implementation drifts to touch other files, stop and ask:

> Step N wanted to modify <planned files>, but I need to also touch <other files>. Update the plan or abort?

Plan drift is cheap to fix; silent scope creep is not.

#### 3d. Verify

Run the step's Verification. Three kinds:

- **Command-shaped** (`tests in src/auth pass`, `npm run build succeeds`, `eslint no errors`). Run the corresponding command. Pass = zero exit + matching expectation. For a test suite, run the tests `../update-codemap/affected-tests.mjs` lists first, to fail fast; then the full command.
- **Artifact-shaped** (`file X contains function Y`, `export Z is defined`). Use Read + Grep to verify.
- **User-attested** (`button renders red`, `loading state is smooth`). No automated test. Mark the step as `unverified, user-attested` and ask the user:

  > Step N verification requires human judgment: "<verification text>". Confirm pass? (y/n/detail)

  On `y` → advance. On `n` → treat as verification failure (3e). On `detail` → show the current state (relevant file contents, recent commands run) then re-ask.

  **Never self-attest** a user-attested verification. If you wrote UI code and the verification is "button is red" — that's not yours to call. Ask.

**Audible skip.** If a check is skipped or downgraded because the change cannot affect it (docs-only, types-only, config-only), say so in the step's result line — a silent skip and a passed check look identical in a result trail, and the one-line say-so is what keeps the gate honest.

**Make the check pass by changing the code it checks.** A verification gate is only worth the work it forces. When a check fails, the fix goes in the thing under test. If a candidate fix instead edits the check itself — disabling or skipping a test, adding a suppression comment or an ignore entry, lowering a severity or a threshold, widening a type or casting past it, loosening an assertion, or excluding the file from the run — that edit **is part of the finding**, not the fix. Stop and report it as the failure it is: say which check was about to be weakened and what it was protecting, then take option 2 or 4. The one legitimate case is a check that is itself wrong, and that is a claim to state out loud and get confirmed, never a change to slip in alongside a fix.

#### 3d.1 Record the outcome to scratch

After every verification, pass or fail, write one scratch entry with `write_memory` (`tier: scratch`, current `session_id`), without prompting. Write what you now know, not a tool log: "ran `npm test`, exit 0" is not knowledge. Command and artifact checks: provenance `model-inferred`, salience `low` on pass and `normal` on fail. User-attested: `user-said`, `normal`, never downgraded. When a failed step is fixed, write a second entry with `supersedes` set to the failing entry's `ts`. Best-effort: if the tool errors, note it once and advance; if it keeps failing, say so once.

#### 3e. On pass / on fail

**Pass:** emit one line and advance:

> ✓ Step N complete: <goal>. Verified by <verification shape>.

**Fail:** stop. Show the verification command's output (or the check that failed). Ask:

> Step N failed verification.
> Verification: <text>
> Output: <captured output>
>
> Options:
>   1. fix and retry — describe the fix, I'll apply it, we re-verify
>   2. edit the plan — you change the plan file, we re-run /execute from step N
>   3. skip this step — mark unverified and continue (rarely right)
>   4. abort — stop executing

Wait for the user's choice. Never advance on a `fail`.

**A routed step that fails** gets one retry where it ran, with new guidance, then moves to the main context. If that also struggles, re-decompose the step. Details: [delegation.md](delegation.md), *When a routed step fails*.

### 4. After all steps complete

#### 4a. Done-criteria assessment

When the plan's pinned spec has `done_criteria`, read [done-criteria.md](done-criteria.md) now and run it: assess each criterion (command, artifact or user-attested), show the table, and let the user confirm, override with a reason, or abort. The autonomy contract's `stopping` posture shapes the pass; it never decides whether a criterion is met. Never auto-confirm. Skip it for a legacy spec with no criteria, a `--task` run or `spec: none`, or a missing spec file (warn first).

#### 4b. Summary

Emit:

> Plan complete. N steps done, M user-attested, 0 failed.
> Done-criteria: <K met / J unsure (user-attested) / 0 failed>   ← omit line in legacy mode
>
> Run `/review` before committing — execute drove the changes, review checks for drift.

**Offer the close** at the depth that fits:

- **Just the changelog line** (the minimum): *"&lt;slug&gt; shipped — log it to CHANGELOG? (y/N)"*. On `y`, invoke [`update-changelog`](../update-changelog/SKILL.md) with the slug (behind its own accept/edit/reject gate).
- **The full terminus** (when the slug has a spec/plan to close out): *"…or run `/close-out &lt;slug&gt;` to close the chain — reconcile shipped reality into the spec, retire the plan + blueprint, and log the ship line in one pass."* [`close-out`](../close-out/SKILL.md) contains the changelog write — point at it when there's a spec to reconcile, the bare changelog line otherwise.

Skip the offer on `abort completion` (nothing shipped). A `--task` run still gets the `/close-out` offer: close-out skips the reconcile step (no spec to reconcile) and performs retire + record only. Do **not** auto-invoke review, `/close-out`, or `/update-changelog`; do **not** auto-commit — all are the user's call, behind their own propose-confirm gates, following the contract's `ask` posture.

## What execute does not do

- Does not draft plans (plan's job).
- Does not load the architectural rules itself (prep does, via 3a).
- Does not run review or capture (separate user-invoked organs).
- Does not save state between invocations. If the user aborts mid-run, re-running `/execute --from N` is how to resume. No hidden progress file; after compaction the compact-snapshot hook restores the last verified step from the ✓ lines.
- Does not trust subagent self-reports — every step still goes through local verification (3d).
- Does not auto-confirm done-criteria assessment (4a). The user is the final judge of whether the spec's intent was actually achieved. Per-step verification passing is necessary but not sufficient.

## Edge cases

- **Empty Files line.** Treat as planning gap; stop with:

  > Step N has no files listed. Update the plan with concrete paths first.

- **Inconsistent heading shapes** (`## Step 2: <goal>` then `## step three: <goal>`). Warn and best-effort parse numeric prefix. If no numeric prefix is recoverable, stop and ask the user to fix the plan.

- **Plan edited mid-run.** Abort (3e option 2), edit, re-run `/execute <slug> --from N`. No in-flight plan edits. Typo/verification fixes may edit the active version directly; shape changes go through `/draft-plan <slug>` for a new version.

- **Plan status is `superseded` or `abandoned`.** Warn before running:

  > Plan <slug> v<N> is `<status>`. Running it anyway? (y/N)

  Default behaviour is to stop unless the user confirms. The warning lets `/execute <path>` re-run an old version intentionally without surprise.

- **Verification output too long.** Cap the shown output at ~50 lines. Summarise the rest. The user can request more.

- **Subagent summary missing verification evidence.** Treat the step as unverified; run the verification in the main context before advancing.

How execute relates to other organs, and debugging notes: [reference.md](reference.md).
