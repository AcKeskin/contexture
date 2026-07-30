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

**Interrupt cadence — read from the autonomy contract's `ask` field** (the contract is the single writer of the ask/cadence dial — one resolving surface, so two surfaces can't drift apart). Resolve the effective contract `live > kickoff > inferred > default > implicit-default` (per [autonomize](../autonomize/SKILL.md) for posture definitions) and read `ask`: **forks-only** — confirm failures/delegations/forks only; **every-step** — confirm each consequential step; **until-blocked** — run until genuinely blocked.

The §3 loop honours the contract-derived cadence at its prompt points (3b delegation, 3d/3e verify/fail). If no autonomy contract is resolvable (autonomize not present / `active.md` + default both absent), fall back to the implicit-default posture (`forks-only`) — execute never blocks on the contract being set.

### 3. For each step

#### 3a. Boundary-crossing re-prep

If this step's files belong to a different *module / language / domain* than the previous step's files, invoke `skills/prep/SKILL.md` with the step's goal as task context. Task-shift detection is the same rule as prep's auto-fire: different subtree root, different language, different domain tag.

First step always triggers prep (no previous step to compare against).

#### 3b. Delegation and routing decision

Delegating a step to a fresh subagent and routing it to a cheaper model tier are the **same decision** — both hand the step to an executor that does not share this conversation. So both read the same two criteria, and neither reads a file count (how many paths a step touches says nothing about whether it can be executed correctly elsewhere):

1. **Self-contained** — the step carries a **Current state** excerpt and an **Exemplar** path, so it stands alone without this conversation.
2. **Mechanically verifiable** — the step's Verification is command-shaped, or artifact-shaped with the exact check written out. User-attested verification disqualifies the step.

**Tier routing (`[mechanical]` steps).** When a step is tagged `[mechanical]` and meets both criteria, run it on the cheap tier by passing the configured model override to the `Task` tool. Do **not** prompt per step — routing follows the autonomy contract's `ask` posture like every other loop decision, and under the default `forks-only` posture a tagged, gated step is not a fork. Announce the routing in the step's opening line, don't ask permission for it.

If a `[mechanical]` step fails either criterion, it does not route — say which criterion failed and run it in the main context. A `[judgment]` step always runs in the main context regardless of its other properties.

The cheap tier resolves from configuration, never from a model name written into a plan or a skill; absent an explicit config entry, dispatch's *Tier and effort selection* table is the resolution (bulk mechanical → lowest tier). Cheap executors inherit the subagent recursion caps: a capped-tier executor does not spawn further agents.

**Subagent delegation (`[delegate]` / `[research]` steps).** When a step is tagged `[delegate]` or `[research]`, ask the user:

> Step N is a subagent candidate (reason: <tag>). Delegate to a fresh subagent? (y/N)

On `y`: invoke the `Task` tool (if available) with:
- Subagent type: default `general-purpose` (or `Explore` if step is clearly research-only).
- Prompt: the step goal + files + outcome + verification + the loaded architectural-rule names + the step's **Current state** excerpt and **Exemplar** path when the plan supplied them — these make the step self-contained for a subagent with no access to this conversation.
- **Self-containment gate.** If the step is `[delegate]`-tagged but carries no Current-state excerpt and no Exemplar, the plan under-specified it for delegation (draft-plan §8). Surface this and ask the user:

  > Step N is tagged `[delegate]` but the plan gives the subagent no Current-state excerpt or Exemplar to work from. Delegating blind risks off-idiom work. Options: (1) run it in-context here instead, (2) re-run `/draft-plan <slug>` to fill in self-containment, (3) delegate anyway.

  Default to running in-context (option 1) unless the user picks otherwise — blind delegation is the failure mode this gate catches.
- Expect a summary back.
- Integrate the summary; do not accept the subagent's claim that work is done until verification (3d) passes.

On `n` (or Task tool unavailable): run the step in the current context. No silent fallback — if the tool is missing, say so.

#### 3b.1 Precondition check (steps routed away from this context)

Before a step runs on the cheap tier or in a subagent, verify its **Current state** excerpt still matches the file it cites. A plan's excerpts pin file state at *draft* time; the repo has moved since, and a strict plan's whole safety argument rests on those excerpts being true.

On a mismatch, do not improvise and do not let the remote executor reconcile it — **escalate the step to the main context** and say why:

> Step N's Current-state excerpt no longer matches `<file:line>` (the plan was drafted against different content). Running it here instead of routing it.

The main context can see the drift and judge it; a cheap or isolated executor working from a stale excerpt produces a confidently wrong diff. Escalation is the cheap outcome — a wrong diff that passes a stale check is not.

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

**Audible skip.** If a check is skipped or downgraded because the change cannot affect it (docs-only, types-only, config-only), say so in the step's result line — a silent skip and a passed check look identical in a result trail, and the one-line say-so is what keeps the gate honest.

#### 3d.1 Record the outcome to scratch

After the verification resolves — **every outcome, pass and fail, all three kinds** — write one scratch entry via the `write_memory` MCP tool (`tier: scratch`, with the current `session_id`). Silent: no prompt, no interruption.

Write the *semantic* reading of the outcome, never a tool-log. "Ran `npm test`, exit 0" is worthless as knowledge and actively dangerous — "ran without error" is not "validated," and encoding it as though it were is the named memory-poisoning enabler. What belongs in the entry is what you now know that you didn't before: what broke and why, which assumption turned out wrong, why an approach was chosen over its alternative.

Per verification kind:

| Kind | `provenance` | `salience` | What to write |
|---|---|---|---|
| Command-shaped | `model-inferred` | `low` on pass, `normal` on fail | On pass: what the passing command establishes. On fail: what broke, and the fix once known. |
| Artifact-shaped | `model-inferred` | `low` on pass, `normal` on fail | What the artifact check confirmed or contradicted. |
| User-attested | `user-said` | `normal` | The user's judgment and any reason they gave. Their call is the source — never downgrade it to inferred. |

On a **fail** that is then fixed (3e option 1), write a second entry once the fix verifies, carrying `supersedes` set to the failing entry's `ts`. The corrected understanding replaces the wrong one for the rest of the session rather than sitting beside it.

Scratch writes are **best-effort and never block the loop**: if the tool errors or is unavailable, note it once and advance — a verification gate must not fail because a note could not be filed. But do not silently swallow a repeated failure; if writes keep failing, say so once so the tier isn't quietly dead.

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

**Guidance round, then escalate, never blind-retry.** For a step that ran outside this context (cheap tier or subagent), a first verification failure does not bring the step home yet — redoing it here costs the whole step at main-context prices, while a guidance round costs a few sentences. When the user picks "fix and retry" for such a step, review the executor's returned diff and output against the step's contract, then re-dispatch the same step to the same tier **once** with a short guidance note: what broke, which constraint it missed, what to do differently. Terse direction, not a rewritten step — if the guidance needs more than a few sentences, the step wasn't mechanical after all; take it over instead.

**Retry session-safety.** Continue the same executor session (where the platform supports continuing a spawned agent) only if nothing else has touched the step's files since it was dispatched; otherwise dispatch fresh with the failing output appended — a resumed session is repairing against a stale world. State which of the two happened in the retry line, so the choice is visible in the result trail.

> Step N failed verification on the <cheap tier | a subagent>. Retrying there once with guidance rather than taking the step over.

If the step fails verification a **second** time, do not retry it there again — run the retry in the main context and say so:

> Step N failed verification twice on the <cheap tier | a subagent>. Escalating to the main context rather than retrying at the same tier.

Two failures on the same step is evidence that the executor cannot do it, not that it needs another attempt. And a retry must always carry new guidance — retrying identically is how a loop burns turns and ends in a worse diff than the first attempt. When the main-context retry *also* struggles, the diagnosis is usually that the step was mis-scoped: **re-decompose it** (split it, or re-draft the step against what the failures revealed) rather than grinding a third attempt — the same diagnosis the consult cap reaches from the other side.

(A stale Current-state excerpt is *not* a consult case — reconciling plan-vs-repo drift is a judgment call, exactly what does not route down. 3b.1's straight escalation stands.)

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
- Plan was run with `--task` (degraded mode — no spec to read criteria from). A plan whose `spec:` frontmatter is `none` is the same case: exempt from the done-criteria echo and from the stale-pin check.
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

Skip the offer on `abort completion` (nothing shipped). A `--task` run still gets the `/close-out` offer: close-out skips the reconcile step (no spec to reconcile) and performs retire + record only. Do **not** auto-invoke review, `/close-out`, or `/update-changelog`; do **not** auto-commit — all are the user's call, behind their own propose-confirm gates, following the contract's `ask` posture.

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
- **capture** — a step's surfaced lesson is the user's own `/capture` call; execute does not auto-capture. **The scratch tier is a carve-out, not an exception to this** (§3d.1): a scratch write is session-scoped, TTL'd and disposable, produces no durable artefact, and is deleted un-promoted at session end — so it is not a capture. Everything that becomes a *durable* memory still passes capture's accept/edit/reject gate, reached through the session-end reflection pass, never from inside this loop.
- **security hooks** — execute runs inside the hook-protected tool surface; no special-casing around hooks.
- **work-state** — reports a slug's chain position and owns the stale-pin check. Inside execute, the superseded-status warning (Edge cases) is the pin guard.
- **close-out** — the scope chain's terminus; execute offers `/close-out <slug>` on done-criteria-met (§4b). Invitation only; close-out never auto-fires.
- **update-changelog** — `/close-out` subsumes it whenever close-out runs; the bare ship line (§4b) is the fallback when the user declines close-out.

## Debug

- **"no recognisable steps"** — the plan file's heading shape is off. Check for `## Step 1: <goal>` exactly. Re-run `/draft-plan` if unsure.
- **Execute keeps re-prepping between every step** — boundary detection is over-triggering (files share a parent directory within 2 levels). Flag via `/capture`.
- **Subagent delegation asks on every step** — more than one step is tagged `[delegate]` or `[research]`. That's by design. If the user finds it noisy, they decline individually; don't auto-change the criteria silently. Note that `[mechanical]` tier routing does *not* ask — if you are being prompted per step, the steps are tagged for delegation, not routing.
- **User-attested verification loop** — if a user-attested step fails and the user picks "fix and retry," the skill must re-verify with the same user-attestation, not advance on author's word.
