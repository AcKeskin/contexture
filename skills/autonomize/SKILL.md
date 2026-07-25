---
name: autonomize
description: "Own the goal-directed autonomy contract — effort / stopping / ask — that execute, checkpoint, orchestrate, and the rule-prime hook read at their decision points, plus dispatch/coordinate/wrap. Set as persistent default, per-task at kickoff, live mid-flight steer, or by short interview. Use on /autonomize, \"set how hard to push\", \"how autonomous should you be\". Mode A — never auto-fires."
---

# autonomize

The goal-directed autonomy organ. It owns **one contract** — *how hard to push, when to stop, when to ask* — and is the single writer of it. The existing workflow organs are **readers** of that contract at their decision points: one owner, many readers (the [retrospect-core](../retrospect-core/SKILL.md) shape). The contract is leverage (set calibration once, the whole workflow shares it), not ceremony.

**The two problems it solves:**

1. **Grounding-before-asking** — the model re-asks mid-task what the front-loaded spec/example/checklist already answers. The contract's `ask` posture rides the rule-prime hook as a *recall-before-ask* reminder: scan the handed-over artefact and state why the answer is not derivable *before* interrupting.
2. **Effort / stopping calibration** — the model under- or over-builds, forcing "keep going" / "leave it here, perfect next session". The contract's `effort` + `stopping` fields are the dial the organs read to calibrate.

```
/autonomize → .claude/autonomy/active.md → read by execute / checkpoint / orchestrate / dispatch / coordinate / wrap / the rule-prime hook
```

## The contract object

One object, three fields, persisted at `.claude/autonomy/active.md` (gitignored, session-scoped):

```yaml
# .claude/autonomy/active.md
effort: balanced        # minimal | balanced | thorough | exhaustive
                        #   depth-of-iteration AND the loop's willingness-to-continue
stopping: criteria-met  # criteria-met | diminishing-returns | budget | user-anytime
                        #   the STOPPING POSTURE — criteria-met DEFERS to the spec's
                        #   done_criteria; it does not redefine "done"
ask: forks-only         # forks-only | every-step | until-blocked
                        #   a POINTER, not a new protocol:
                        #     forks-only   → act-dont-ask (reversible) + ambiguity-depth
                        #     every-step   → confirm each consequential step
                        #     until-blocked → run until genuinely blocked or irreversible
```

**Field semantics (the contract carries posture, not evaluation):**

- `effort` — one coarse dial wired to *both* per-step depth and the continue-vs-stop threshold. `minimal` = MVP-grade, stop sooner; `exhaustive` = push hard, keep refining while value remains.
- `stopping` — selects *which posture* governs the stop; it never re-decides whether a criterion is met (that's the spec's `done_criteria` + execute §4a). `criteria-met` defers to the spec. `diminishing-returns` stops when an iteration yields nothing material (prose/design with no test). `budget` stops at a turn/step ceiling. `user-anytime` = "leave it here, perfect next session" — freeze a coherent best-so-far and record what remains.
- `ask` — points at the shipped ambiguity-depth boundary + reversibility preference (act-dont-ask). The contract surfaces *which threshold is active*; the protocol lives in those rules, unchanged.

### The implicit default (fallback posture)

When nothing is set and a consumer must act before a contract is resolved, the implicit default is:

```yaml
effort: balanced
stopping: criteria-met
ask: forks-only
```

This matches the system's baseline behaviour (act-dont-ask + the ambiguity-depth boundary), so the organ **adds nothing until tuned** — zero ceremony for the common case. The implicit default is distinct from the *empty-default interview* (below): the interview is the primary path when no contract is set; the implicit default is only the posture a consumer reads if it must act mid-resolution.

### Precedence (how the four modes resolve)

A consumer reads the **effective contract**, resolved in this order (first present wins per field):

```
live  >  kickoff  >  (inferred)  >  default  >  implicit-default
```

- **live** — a mid-flight `/autonomize` steer, written to `active.md` for the *current task only*.
- **kickoff** — a per-task `/autonomize effort=… ask=…` (or set inline by `/spec` / `/draft-plan`), in `active.md`.
- **inferred** — *deferred*: artefact-inference mode. Slot reserved in the order.
- **default** — the persistent `autonomy:` block resolved by the rule-overlay cascade (shipped < user < project).
- **implicit-default** — the balanced/criteria-met/forks-only fallback above.

**Live never persists.** A live steer is task-scoped: at the next task boundary the contract re-resolves from kickoff/default and the live value is **discarded — always, no exception**. A one-off "go easy" must never silently make the next task lazy.

## When to run

- `/autonomize` (no args), **contract set** → show the active contract + its source tier; offer to edit.
- `/autonomize` (no args), **no contract set** → run the **contract-establishing interview** (§3).
- `/autonomize effort=thorough ask=forks-only` (kickoff) → propose those values, confirm, write `active.md`. No interview.
- `/autonomize <natural-language steer>` (e.g. "leave it here", "go deeper", "keep pushing") → map to a contract delta, propose-confirm, write `active.md` **for the current task only**.
- Natural language: "set how hard to push", "how autonomous should you be", "keep going" / "leave it here".
- **Do not auto-fire.** Mode A, user-invoked. No hook, no session-start trigger. Every write is propose-confirm.

## 1. Resolve and show the contract

Read the effective contract by the precedence above. On `/autonomize` with no args:

- **Contract set** → render the active contract, annotate each field's *source tier* (live / kickoff / persistent default), and offer to edit (kickoff form) or clear.
- **No contract set** (no `active.md`, no rule-tier `autonomy:` default) → go to §3 (the interview).

## 2. Write the contract (kickoff + live steer)

`/autonomize` is the **sole writer** of `active.md`. Two write paths, both propose-confirm:

### 2a. Kickoff form

`/autonomize effort=thorough stopping=criteria-met ask=forks-only` (any subset of fields; unset fields fall through to the lower precedence tiers). Validate each value against its enum; reject an unknown value with the allowed set. Propose the resulting effective contract, confirm, write `active.md`. **No interview** — the user stated the values.

### 2b. Live mid-flight steer

`/autonomize <natural language>` corrects the *current trajectory*. Map the steer to a contract delta, propose-confirm, write `active.md` **for the current task only**. Closed-vocabulary mapping (extend the lexicon deliberately, not by guessing):

| Steer | Delta |
|---|---|
| "leave it here" / "that's enough" / "wrap up" | `stopping: user-anytime` (freeze best-so-far, record what remains) |
| "go deeper" / "be thorough" | `effort` up one rung + `stopping` relaxed toward keep-refining |
| "keep pushing" / "keep going" | `stopping` relaxed (don't stop at the current threshold); `effort` up if already at criteria-met |
| "go light" / "just the MVP" | `effort: minimal`, `stopping: criteria-met` |
| "check with me more" | `ask: every-step` |
| "run with it" / "don't ask" | `ask: until-blocked` |

**Never silent.** The steer is *surfaced* (the proposed delta is shown) and confirmed before the write — never inferred from a plain-language phrase in the running message stream (silent delta-scanning is an explicit non-goal). And it **never persists past the current task** (see Precedence).

## 3. The contract-establishing interview (empty-default behavior)

When a task begins and **no contract is set** (no `active.md`, no persistent default), `/autonomize` establishes the contract *before* the model proceeds autonomously — "set things clear first". A short **2–3 question** interview (`AskUserQuestion`, fall back to plain text):

1. **How deep?** → `effort` (MVP/minimal · balanced · thorough · exhaustive).
2. **When do I stop?** → `stopping` (when the done-criteria are met · when refining stops paying off · at a budget · whenever you say so).
3. **How often check in?** → `ask` (only on real forks · every consequential step · run until blocked). *(Skippable if the first two make it obvious; keep it to 2–3 total.)*

**The convergence guardrail (the anti-ceremony move).** The interview, in the *same exchange*, **offers to save the result as the rule-tier persistent default**:

> Save this as the default for this project, so I don't ask again? (yes / just this task)

- **Save** → write the `autonomy:` block to the project-tier rule overlay (§4 mechanism). The asking **stops** — every later task reads the default silently. → converges to **one interview per project**.
- **Just this task** → write `active.md` only; the next contract-less task asks again (the user's choice; the friction is theirs to end by saving).

So the interview fires on every contract-less task *until a default exists* — but it is engineered to *create the default that ends the interviewing* on its first run. This keeps "ask when nothing is set" honest without interrogating every task forever.

## 4. The persistent default (a rule whose payload is its frontmatter)

The persistent default is **not a free config file** — it is a *rule file* in the existing rule-overlay tree, [`architectural-rules/universal/autonomy-default.md`](../../architectural-rules/universal/autonomy-default.md), carrying the posture in an `autonomy:` **frontmatter block**:

```yaml
# architectural-rules/universal/autonomy-default.md  (frontmatter)
autonomy:
  effort: balanced
  stopping: criteria-met
  ask: forks-only
```

This homes the default in the rule overlay (your project default is exactly the kind of overridable, tiered "how Claude works here" thing the overlay governs) and gets the **cascade + override + disable** semantics for free — project > user > shipped, no parallel config engine. The save-as-default (§3) writes a project-tier `autonomy-default.md` with the chosen block.

**How it's read:** `/autonomize` and the organs read the **typed `autonomy:` frontmatter values directly** from the resolved file — *not* via `resolve-rules.js`, which emits prose rule-bodies for priming and parses only the resolution fields (name/scope/relevance/override/mode), not custom keys. So the rule-body resolver stays untouched (no abuse of a body-resolver for config values); the default is a rule whose *payload is its frontmatter*. `relevance: on-demand` keeps it off the always-on floor. The resolved default sits below `active.md` in the precedence above.

## What autonomize does not do

- **Not a done-ness evaluator.** `stopping` selects a posture; the spec's `done_criteria` + execute §4a own evaluation. The contract never re-decides whether a criterion is met.
- **Not a new ask protocol.** `ask` points at the shipped ambiguity-depth boundary + act-dont-ask; it defines no new ambiguity or reversibility rule.
- **Not a hook.** No `autonomy-prime.js`, no auto-fire, no per-turn always-on line of its own — the recall-before-ask line rides the rule-prime hook's existing injection (deviation-only).
- **Not a silent learner / no silent auto-detect.** Every write is propose-confirm. A live steer is surfaced and confirmed, never flipped from a prose match in the message stream.
- **Not an always-on floor rule.** The recall-before-ask discipline lives in the prompt-authoring rules; the dial is situational, off the universal floor.
- **Not mid-flight supervision of a dispatched subagent.** The platform has no model-visible channel into a running subagent; orchestrate reads the contract at dispatch only.
- **Not mode (d) inference** (artefact-derived contract) — deferred behind a named trigger in v1.

## Relationship to other organs

- **execute** — reads `ask` at §2.5 (`--strategy` stays execute's own method choice) and `stopping` at §4a. The largest consumer seam.
- **checkpoint** — the fit-pass reads `stopping` to size its drift question (`user-anytime` → freeze-and-record; `criteria-met` → all-met + gold-plating check).
- **orchestrate** — Q4 convergence reads `stopping`. The per-unit `effort`/`ask` threading at fan-out is owned by **dispatch** (its "Autonomy contract at dispatch" section), which orchestrate composes; read at dispatch only (no mid-flight subagent steer).
- **dispatch** — owns the contract-at-dispatch wiring: scales each unit's `maxTurns` to `effort` and passes the `ask` posture into the unit prompt.
- **coordinate** — reads `ask` to decide whether board ops run auto or per-invocation.
- **wrap** — reads the contract once to set the interrupt posture for the whole closing ceremony.
- **rule-prime hook** — carries the recall-before-ask deviation line when the contract deviates from default; zero injection at default. No sibling hook.
- **spec / draft-plan** — set the contract inline as one interview question (the implicit surface of the kickoff mode); they call autonomize as a library.
- **rule overlay** — the persistent-default home (one more overlaid tier).
- **Leverage over ceremony** — the reason the contract is two posture-fields + a pointer, not a four-field config system.
