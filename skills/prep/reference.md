# prep: reference

Read when the step you are on points here, or when something fails.

## Failure modes

- **Scope detection returned `[global]` only.** The task was vague. Surface the thin detection explicitly in the priming block so the user can override. Do not guess a more specific scope.
- **Discover returned zero fragments.** Use the empty-result shape from step 5. Do not fabricate rules.
- **`.claude/architecture.md` is huge (>500 lines).** Read only the sections relevant to the task scope. If relevance is unclear, summarise: *"Project has a large architecture.md — loaded sections matching <scope>; the rest is available on request."*
- **Task-shift prompt fires too often.** Budget kicks in at 1-per-3 file operations. If budget is exhausted and drift still seems real, wait until the next file operation window rather than skipping acknowledgement entirely.
- **Push-back maps to no existing rule AND no clear captureable text.** Ask one clarifying question (*"Should this be a project-specific rule, a language rule, or a universal rule?"*) before proposing capture.

## What prep does NOT do

- **Does not monitor keystrokes or tool calls in real time.** Task-shift is observed at Claude's own judgement boundaries (about to read / write), not continuously.
- **Does not persist primed scope across sessions.** Ephemeral per session.
- **Does not review code for rule violations.** That's review. Prep primes; review audits.
- **Does not auto-capture new rules.** Push-back produces a capture *proposal*, never a silent write.
- **Does not substitute for the user's architectural judgement.** Surfaces rules, the user decides which apply in context.
- **Does not modify rule files.** Read-only over the architectural-rules tree.
- **Does not include session recaps.** `include_recaps: false` on the discover call. Recaps are episodic recall, orthogonal to rule-priming.

## Relationship to other organs

- **discover** — prep's retrieval engine. Prep never re-implements discovery logic.
- **deliver** — prep passes `render_bodies: true`; deliver handles tier ordering and caps within its own contract.
- **capture** — push-back → capture proposal. Prep never writes directly.
- **architectural-rules tree** — the corpus prep primes from. Prep's quality is bounded by the corpus's quality.
- **project-architecture.md** — the project's canonical architectural file. Prep reads it directly (step 3), not via discover.
- **review** — review consumes the same primed scope signal. For now, prep's primed-scope note is session-internal only.
- **recap** — prep does not load recaps into the priming block. Recaps belong in `/discover`-style recall, not rule priming.
- **rule-prime hook** — the mechanical half of priming. The hook owns the *floor* and records it in the `rulePrime` session watermark; prep reads that watermark (step 0) and runs the *deep* pass instead of re-priming. When the hook is off, prep owns the floor (the legacy path). Rationale + the drift flag: [`docs/prep-organ.md`](../../docs/prep-organ.md).
- **persist-before-discard rule + clear-context-decision-guard hook** — prep surfaces the rule like any other when the scope matches session-close; the hook is the mechanical backstop. Rule and hook must stay aligned. Rationale: [`docs/prep-organ.md`](../../docs/prep-organ.md).

See [`docs/prep-organ.md`](../../docs/prep-organ.md) for the scope map and the rationale behind each rule.

### 8. Push-back handling (continuous, not a one-time step)

When the user corrects Claude with reference to a rule ("you violated SoC", "this imports /api directly — go via services", "that's not how we do naming here"):

1. Note the correction.
2. Identify whether the correction maps to:
   - **A rule already in the primed set.** Claude missed it — acknowledge, adjust the code, no capture needed (the rule exists).
   - **A rule not in the primed set but already captured.** Prep's scope detection missed it — acknowledge, offer to re-run `/prep` with broader scope.
   - **A rule that does not exist in the tree.** Propose a capture: *"This correction looks like a new rule. Capture it via `/capture`?"* — invokes [`skills/capture/SKILL.md`](../capture/SKILL.md) with the user's correction text as candidate content. Capture's own confirmation flow runs.
3. Never auto-capture. Collaborator principle.

More in [reference.md](reference.md): failure modes, What prep does NOT do, relationship to other organs.
