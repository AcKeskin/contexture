---
name: execute
description: "Run a plan step-by-step with verification gates — pick a strategy up front (sequential / subtask / multi-agent→/orchestrate), read the interrupt cadence from the autonomy contract, advance only on pass, stop on any failure — never advance silently. Re-preps on module-boundary crossings; delegation asks first; prompts /review after. User-invoked: /execute [slug | path] [--from N] [--strategy …]. Never auto-fires."
---

# execute

The execute organ. Consumes [prep](../prep/SKILL.md) for per-step rule re-load on boundary crossings; consumes [discover](../discover/SKILL.md) indirectly via prep.

Execute is the *last phase* of the `spec → plan → execute → review` workflow. It runs a plan step-by-step with verification gates. It does not plan, does not draft, does not commit.

## When to run

**Manual only.** User invokes `/execute [slug | path] [--from N]`.

**Do not auto-fire:**
- Not at session start.
- Not after `/draft-plan` finishes — the user must review the plan first.
- Not on any hook — this skill implements code changes, that's always user-initiated.

## Inputs

- **Plan resolution.** One of:
  - **Slug** (`/execute <slug>`) — resolve to `.claude/plans/<slug>/v<N>.md` where N is the active version per `.claude/plans/INDEX.md`.
  - **No argument** — read `.claude/plans/INDEX.md` and resolve in order: (1) if `default` row has `status: active`, use it; (2) else if exactly one row has `status: active`, use it; (3) else list active slugs and ask the user.
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

**Interrupt cadence — read from the autonomy contract's `ask` field** (the contract is the single writer of the ask/cadence dial — one resolving surface, so two surfaces can't drift apart). Resolve the effective contract `live > kickoff > inferred > default > implicit-default` (per [autonomize](../autonomize/SKILL.md) for posture definitions) and read `ask`: **forks-only** — confirm failures/delegations/forks only; **every-step** — confirm each consequential step; **until-blocked** — run until genuinely blocked.

The §3 loop honours the contract-derived cadence at its prompt points (3b delegation, 3d/3e verify/fail). If no autonomy contract is resolvable (autonomize not present / `active.md` + default both absent), fall back to the implicit-default posture (`forks-only`) — execute never blocks on the contract being set.

### 3. For each step

#### 3a. Boundary-crossing re-prep

If this step's files belong to a different *module / language / domain* than the previous step's files, invoke `skills/prep/SKILL.md` with the step's goal as task context. Task-shift detection is the same rule as prep's auto-fire: different subtree root, different language, different domain tag.

First step always triggers prep (no previous step to compare against).

#### 3b. Delegation decision

If any of the following is true:
- Step tagged `[delegate]`.
- Step tagged `[research]`.
- Step's Files line lists >5 concrete paths.

...ask the user:

> Step N is heuristically a good subagent candidate (reason: <tag or file count>). Delegate to a fresh subagent? (y/N)

On `y`: invoke the `Task` tool (if available) with:
- Subagent type: default `general-purpose` (or `Explore` if step is clearly research-only).
- Prompt: the step goal + files + outcome + verification + the loaded architectural-rule names + the step's **Current state** excerpt and **Exemplar** path when the plan supplied them — these make the step self-contained for a subagent with no access to this conversation.
- **Self-containment gate.** If the step is `[delegate]`-tagged but carries no Current-state excerpt and no Exemplar, the plan under-specified it for delegation (draft-plan §8). Surface this and ask the user:

  > Step N is tagged `[delegate]` but the plan gives the subagent no Current-state excerpt or Exemplar to work from. Delegating blind risks off-idiom work. Options: (1) run it in-context here instead, (2) re-run `/draft-plan <slug>` to fill in self-containment, (3) delegate anyway.

  Default to running in-context (option 1) unless the user picks otherwise — blind delegation is the failure mode this gate catches.
- Expect a summary back.
- Integrate the summary; do not accept the subagent's claim that work is done until verification (3d) passes.

On `n` (or Task tool unavailable): run the step in the current context. No silent fallback — if the tool is missing, say so.

#### 3c. Implement

Apply the described changes. Use Edit / Write / Bash / whatever the step requires. The plan's Files and Outcome lines are the contract — if the implementation drifts to touch other files, stop and ask:

> Step N wanted to modify <planned files>, but I need to also touch <other files>. Update the plan or abort?

Plan drift is cheap to fix; silent scope creep is not.

#### 3d. Verify

Run the step's Verification. Three kinds:

- **Command-shaped** (`tests in src/auth pass`, `npm run build succeeds`, `eslint no errors`). Run the corresponding command. Pass = zero exit + matching expectation.
- **Artifact-shaped** (`file X contains function Y`, `export Z is defined`). Use Read + Grep to verify.
- **User-attested** (`button renders red`, `loading state is smooth`). No automated test. Mark the step as `unverified, user-attested` and ask the user:

  > Step N verification requires human judgment: "<verification text>". Confirm pass? (y/n/detail)

  On `y` → advance. On `n` → treat as verification failure (3e). On `detail` → show the current state (relevant file contents, recent commands run) then re-ask.

  **Never self-attest** a user-attested verification. If you wrote UI code and the verification is "button is red" — that's not yours to call. Ask.

#### 3e. On pass / on fail

**Pass:** emit one line and advance:

> ✓ Step N complete: <goal>. Verified by <verification shape>.

(Only use the checkmark char — avoid emoji unless the user has asked for them.)

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

### 4. After all steps complete

#### 4a. Done-criteria assessment (default mode only)

If the plan's pinned spec has a `done_criteria` list (non-empty in non-legacy plans), run a final assessment pass before declaring completion. **The plan's per-step verification answers "did this step do its part." The done-criteria assessment answers "did the spec actually get satisfied." Both gates matter.**

**The autonomy contract's `stopping` posture governs *how* this pass behaves** (read the effective contract per [autonomize](../autonomize/SKILL.md)):
- **criteria-met** (default) — the standard pass below: every criterion must be met; flag any finished item that traces to no criterion (gold-plating).
- **user-anytime** — freeze a coherent best-so-far, list criteria met vs outstanding (recorded, not failed), offer `/recap`.
- **diminishing-returns** / **budget** — stop when the last step yielded nothing material, or at the step/turn ceiling; report met-vs-outstanding.

The contract never re-decides whether a criterion is *met* — that stays this section's evaluation.

Procedure:

1. Open the pinned spec file (path from the plan's `spec:` frontmatter). Read its `done_criteria:` frontmatter list.

2. For each criterion, assess against the actual implementation. Three verdict shapes — same shape as step verification (3d):
   - **Command-shaped criterion** ("done when `npm run build` exits 0") — run the command. Verdict: pass / fail.
   - **Artifact-shaped criterion** ("done when file X contains function Y") — Read + Grep. Verdict: pass / fail.
   - **User-attested criterion** ("done when the API feels intuitive", "done when output reads naturally") — no automated check. Mark `unsure, user-attested` and surface for user judgment.

3. Build the assessment table:

   ```
   ## Done-criteria assessment (spec <slug> v<M>)

   | # | Criterion | Verdict | Evidence |
   |---|-----------|---------|----------|
   ```

   One row per criterion; verdicts ✓ pass / ✗ fail / ? unsure (user-attested); Evidence = command output or file:line.

4. Surface to the user via propose-confirm-commit:

   > Done-criteria assessment complete. Confirm overall completion?
   >
   > <table above>
   >
   > Options:
   >   1. confirm complete — all criteria met as shown, mark plan done, prompt for /recap
   >   2. partial-met override — some criteria failed/unsure, but ship anyway with documented exceptions (you supply the reason)
   >   3. abort completion — go back, fix what's missing, re-run /execute --from N or edit plan
   >
   > For unsure / user-attested criteria, your call settles the verdict.

5. Wait for the user's choice. **Never auto-confirm.** The user is the final judge — especially for criteria that require subjective judgment ("output reads naturally"), Claude's assessment is a proposal, not a verdict.

6. On `confirm complete` → proceed to 4b summary.
7. On `partial-met override` → record the override reason in the summary; proceed to 4b.
8. On `abort completion` → stop without writing the summary; user resumes with `/execute --from N` after fixing.

**Skip 4a entirely** when:
- Spec has no `done_criteria` (legacy spec — note in summary that completion is per-step verification only).
- Plan was run with `--task` (degraded mode — no spec to read criteria from).
- Plan's `spec:` frontmatter points at a missing file (warn, then skip).

#### 4b. Summary

Emit:

> Plan complete. N steps done, M user-attested, 0 failed.
> Done-criteria: <K met / J unsure (user-attested) / 0 failed>   ← omit line in legacy mode
>
> Run `/review` before committing — execute drove the changes, review checks for drift.

**Offer the close** at the depth that fits:

- **Just the changelog line** (the minimum): *"&lt;slug&gt; shipped — log it to CHANGELOG? (y/N)"*. On `y`, invoke [`update-changelog`](../update-changelog/SKILL.md) with the slug (behind its own accept/edit/reject gate).
- **The full terminus** (when the slug has a spec/plan to close out): *"…or run `/close-out &lt;slug&gt;` to close the chain — reconcile shipped reality into the spec, retire the plan + blueprint, and log the ship line in one pass."* [`close-out`](../close-out/SKILL.md) contains the changelog write — point at it when there's a spec to reconcile, the bare changelog line otherwise.

Skip the offer on `abort completion` (nothing shipped) and on `--task` against a throwaway plan (no spec → no `/close-out`; the bare changelog line still applies). Do **not** auto-invoke review, `/close-out`, or `/update-changelog`; do **not** auto-commit — all are the user's call, behind their own propose-confirm gates, following the contract's `ask` posture.

## What execute does not do

- Does not draft plans (plan's job).
- Does not load the architectural rules itself (prep does, via 3a).
- Does not run review or capture (separate user-invoked organs).
- Does not save state between invocations. If the user aborts mid-run, re-running `/execute --from N` is how to resume. No hidden progress file.
- Does not trust subagent self-reports — every step still goes through local verification (3d).
- Does not bypass any security hook — PreToolUse hooks remain in force.
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

## Relationship to other organs

- **prep** — re-invoked on module boundary crossings; prep loads rules, execute honours them per-step.
- **discover** — not called directly; prep handles that. Mid-run memory lookups are the user's own `/discover` call.
- **review** — the post-completion prompt nudges `/review`; not an execute sub-step.
- **capture** — a step's surfaced lesson is the user's own `/capture` call; execute does not auto-capture.
- **security hooks** — execute runs inside the hook-protected tool surface; no special-casing around hooks.
- **work-state** — stale-pin pre-run guard is a deferred v2 seam; until then the superseded-status warning (Edge cases) is the only pin guard.
- **close-out** — the scope chain's terminus; execute offers `/close-out <slug>` on done-criteria-met (§4b). Invitation only; close-out never auto-fires.
- **update-changelog** — execute offers the bare ship line (§4b) when there's no spec to reconcile; otherwise `/close-out` subsumes it.

## Debug

- **"no recognisable steps"** — the plan file's heading shape is off. Check for `## Step 1: <goal>` exactly. Re-run `/draft-plan` if unsure.
- **Execute keeps re-prepping between every step** — boundary detection is over-triggering (files share a parent directory within 2 levels). Flag via `/capture`.
- **Subagent delegation asks on every step** — more than one step is tagged `[delegate]` or touches >5 files. That's by design. If the user finds it noisy, they decline individually; don't auto-change the heuristic silently.
- **User-attested verification loop** — if a user-attested step fails and the user picks "fix and retry," the skill must re-verify with the same user-attestation, not advance on author's word.
