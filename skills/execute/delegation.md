# execute: routed and delegated steps

Read this when a step is tagged `[mechanical]`, `[delegate]` or `[research]`, and again when such a step fails verification. It lives outside SKILL.md so the main loop stays inside what Claude Code keeps after compaction.

## Delegation and routing decision

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

## Precondition check

Before a step runs on the cheap tier or in a subagent, verify its **Current state** excerpt still matches the file it cites. A plan's excerpts pin file state at *draft* time; the repo has moved since, and a strict plan's whole safety argument rests on those excerpts being true.

On a mismatch, do not improvise and do not let the remote executor reconcile it — **escalate the step to the main context** and say why:

> Step N's Current-state excerpt no longer matches `<file:line>` (the plan was drafted against different content). Running it here instead of routing it.

The main context can see the drift and judge it; a cheap or isolated executor working from a stale excerpt produces a confidently wrong diff. Escalation is the cheap outcome — a wrong diff that passes a stale check is not.

## When a routed step fails

**Guidance round, then escalate, never blind-retry.** For a step that ran outside this context (cheap tier or subagent), a first verification failure does not bring the step home yet — redoing it here costs the whole step at main-context prices, while a guidance round costs a few sentences. When the user picks "fix and retry" for such a step, review the executor's returned diff and output against the step's contract, then re-dispatch the same step to the same tier **once** with a short guidance note: what broke, which constraint it missed, what to do differently. Terse direction, not a rewritten step — if the guidance needs more than a few sentences, the step wasn't mechanical after all; take it over instead.

**Retry session-safety.** Continue the same executor session (where the platform supports continuing a spawned agent) only if nothing else has touched the step's files since it was dispatched; otherwise dispatch fresh with the failing output appended — a resumed session is repairing against a stale world. State which of the two happened in the retry line, so the choice is visible in the result trail.

> Step N failed verification on the <cheap tier | a subagent>. Retrying there once with guidance rather than taking the step over.

If the step fails verification a **second** time, do not retry it there again — run the retry in the main context and say so:

> Step N failed verification twice on the <cheap tier | a subagent>. Escalating to the main context rather than retrying at the same tier.

Two failures on the same step is evidence that the executor cannot do it, not that it needs another attempt. And a retry must always carry new guidance — retrying identically is how a loop burns turns and ends in a worse diff than the first attempt. When the main-context retry *also* struggles, the diagnosis is usually that the step was mis-scoped: **re-decompose it** (split it, or re-draft the step against what the failures revealed) rather than grinding a third attempt — the same diagnosis the consult cap reaches from the other side.

(A stale Current-state excerpt is *not* a consult case — reconciling plan-vs-repo drift is a judgment call, exactly what does not route down. 3b.1's straight escalation stands.)
