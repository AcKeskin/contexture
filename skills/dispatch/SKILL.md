---
name: dispatch
description: Use when facing 2+ independent tasks (different test files, different subsystems, different bugs) that can be investigated or fixed in parallel without shared state or sequential dependencies.
---

# Dispatch

## Overview

You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

When you have multiple unrelated failures (different test files, different subsystems, different bugs), investigating them sequentially wastes time. Each investigation is independent and can happen in parallel.

**Core principle:** Dispatch one agent per independent problem domain. Let them work concurrently.

**Before any Agent-tool call, walk the three hard-cap gates in [Hard caps](#hard-caps). A failed gate aborts the dispatch.** The hard caps prevent runaway recursion, geometric cost compounding, and parent loss of synthesis — failure modes the soft "When to Use" heuristics below do not catch on their own.

## When to Use

**Use when:**
- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**
- Failures are related (fixing one might fix others): investigate together first
- Understanding needs the whole system, or you don't know what's broken yet
- Agents would interfere (same files, same resources)

## The Pattern

### 1. Identify Independent Domains

Group failures by what's broken:
- File A tests: Tool approval flow
- File B tests: Batch completion behavior
- File C tests: Abort functionality

Each domain is independent - fixing tool approval doesn't affect abort tests.

### 2. Create Focused Agent Tasks

Each agent gets:
- **Specific scope:** One test file or subsystem
- **Clear goal:** Make these tests pass
- **Scope, stated positively:** name what they *may* edit (e.g. "edit only `src/auth/`"). Negative "don't touch X" fences barely work on their own (~0% deterrent — see `/orchestrate`'s sourced finding); positive scope guides attention, and hard placement (worktree / allowlist) is what holds them in bounds.
- **Expected output:** Summary of what you found and fixed

### 3. Dispatch in Parallel

```typescript
// In Claude Code / AI environment
Agent("Fix agent-tool-abort.test.ts failures")
Agent("Fix batch-completion-behavior.test.ts failures")
Agent("Fix tool-approval-race-conditions.test.ts failures")
// All three run concurrently
```

### 4. Review and Integrate

When agents return:
- Read each summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

## Agent Prompt Structure

Good agent prompts are:
1. **Focused** - One clear problem domain
2. **Self-contained** - All context needed to understand the problem
3. **Specific about output** - What should the agent return?
4. **Depth-annotated** - Tells the subagent its current depth and remaining depth budget (required by Gate 2 of [Hard caps](#hard-caps)).
5. **Budgeted** — carries a `maxTurns` scaled to the autonomy contract's `effort` (see "Autonomy contract at dispatch" below).
6. **Ask-postured** — carries the contract's `ask` posture, so the unit knows whether to return BLOCKED on a fork or run to its budget.

### The delegation brief

A delegated unit's prompt carries five fields — the standing shape of a dispatch, not a suggested outline:

- **Goal** — what done looks like, one or two sentences.
- **Files** — exact `path:line` pointers to where the work happens.
- **Constraints** — the conventions and boundaries that bind this unit.
- **Acceptance** — the observable criteria the result must meet.
- **Verify** — exact commands. For a below-parent-tier dispatch this field is required, not advisory: a unit routes below the parent's tier only when a command can catch it being wrong, and the brief is where that command becomes visible to the executor.

**Pointers, not pastes.** Paste only what the executor cannot cheaply derive itself — error output, cross-package signatures. Everything else travels as a `path:line` pointer; a pasted file body is paid for twice, once in the parent's context to produce and once in the child's to receive. And **explore before dispatching**: the parent has already paid for orientation, so resolve the pointers yourself (or via a scout) rather than making the executor re-discover context you already have. Explore only what the units *share* — per-unit discovery belongs in the unit.

The depth annotation is a single line at the top of the subagent's prompt:

```
You are a depth-N subagent. Maximum allowed depth is 2. You may spawn one more level only if N < 2; beyond that, return work to your parent rather than spawning.
```

Where N is the current depth (1 if dispatched by the user-facing agent, 2 if dispatched by a depth-1 subagent). The parent always knows N because the parent itself was told its depth on dispatch — passing the count down by convention requires no harness change.

A full prompt with the annotation: [reference.md](reference.md), *Full example*.

### Autonomy contract at dispatch

Read the effective autonomy contract once per dispatch batch — `.claude/autonomy/active.md`, falling through to the rule-tier `autonomy:` default ([autonomize](../autonomize/SKILL.md)) — and wire two fields into every unit:

- **`effort` → step budget.** Scale the unit's `maxTurns`: `minimal` → tight (~8 turns; favour an early BLOCKED over deep work), `balanced` → ~15, `thorough` → ~25, `exhaustive` → ~40. Anchors, not law — scale to unit size. `maxTurns` does not cascade from the parent; set it explicitly on every unit.
- **`ask` → return posture.** `forks-only` → return BLOCKED on a real fork rather than guessing; `every-step` → more granular partial returns (no mid-flight confirmations exist); `until-blocked` → run to the budget.

No contract set and no rule-tier default → dispatch as `balanced` / `forks-only`.

This section is the single owner of contract-to-dispatch wiring; orchestrate's Q3 references it rather than restating it.

## Consult returns (below-parent-tier units)

A unit dispatched below the parent's tier gets a channel to ask instead of guessing. Before writing that prompt, read [consult.md](consult.md): it gives the lines to paste (stop and consult before the first state change, when stuck, or before switching approach; the hard-rule form for the lowest tier). The parent answers in a few sentences, caps it at two consults per unit, and adds no consult lines to parent-tier dispatches.

## Output contract (for agents that declare one)

Some agents under `agents/` declare an `## Output contract` section specifying a YAML schema their response must follow. When such an agent is dispatched, a PostToolUse hook on the Agent tool (`hooks/agent-output-contract-validator.js`) validates the last fenced ```yaml block in the response and emits a non-blocking advisory in the orchestrator's next turn if the block is missing or malformed.

**Opt-in is per-agent and detected automatically:** add `## Output contract` and `## Required reads` sections to the agent's `.md` and the hook starts checking on the next dispatch. There is no allow-list to maintain. Agents without those sections are unchanged in behaviour.

The advisory is informational — it never rejects the agent response, so an orchestrator that needs strict compliance must re-dispatch on its own initiative.

## Harvesting subagent state

Every dispatch prompt carries one line:

> If you reach a decision, lesson, or landmine worth remembering beyond this task, emit a `harvest:` block per the return contract (decisions / lessons / open_questions). Omit it entirely if there's nothing worth keeping.

When a reply carries one, the output-contract hook flags it. Route each item only on the user's confirmation; the schema and routing are in [harvest.md](harvest.md). Nothing is auto-written.

## Common Mistakes

**❌ Too broad:** "Fix all the tests" - agent gets lost
**✅ Specific:** "Fix agent-tool-abort.test.ts" - focused scope

**❌ No context:** "Fix the race condition" - agent doesn't know where
**✅ Context:** Paste the error messages and test names

**❌ Negative fence:** "Do NOT change production code" — ~0% deterrent on its own (see `/orchestrate`)
**✅ Positive scope:** "Edit only the test files" — and for write tasks, place the agent where that scope is physically enforced

**❌ Vague output:** "Fix it" - you don't know what changed
**✅ Specific:** "Return summary of root cause and changes"

## Tier and effort selection

The gates below only prevent bad dispatches; they don't pick good ones. Before walking the gates, choose the **lowest** tier the unit's judgment load allows — the default is not "parent tier for everything":

| Unit shape | Model | Reasoning effort |
|---|---|---|
| Bulk mechanical work, no judgment — file sweeps, renames, grep-and-collect, fixture generation, format conversion | `haiku` | low |
| Scoped implementation with a known approach — write/fix code in one module, make failing tests pass, apply a described refactor | `sonnet` (or the matching `-pro` agent) | inherit |
| Judgment-heavy work — design decisions, cross-module synthesis, review verdicts, root-cause analysis | inherit the parent model (no override) | inherit; raise only for the hardest verify/judge units |

Three rules ride on the table:

- **Tier zero is a script.** If the unit is fully deterministic — a rename sweep, a format conversion, grep-and-collect, fixture generation from a template — write and run a script instead of dispatching any model. A script is cheaper than any tier, exactly repeatable, and reviewable as an artifact. The general rule: pick the cheapest executor sufficient for the unit's *nature* — script, then cheap model, then parent model — never its size.
- **Downgrade is the default question.** For every unit, ask "what judgment does this actually need?" before dispatching at parent tier. Parent-tier-for-everything is the silent cost failure the gates cannot catch — they cap escalation, not waste.
- **A unit that mixes shapes is two units.** A mechanical sweep plus a judgment call is two dispatches at two tiers, not one dispatch at the higher tier.

Reasoning effort follows the same logic: set `effort` in the agent definition (or accept the definition's value); drop to low for mechanical units, raise only for the hardest verify/judge units.

## Hard caps

Three gates every dispatch must pass. These are **hard caps**, not heuristics — a failed gate aborts the dispatch. They exist because the failure mode they prevent (runaway recursion) is severe and silent: by the time the call tree is deep, the parent has already lost the ability to synthesize, and cost has compounded geometrically.

### Gate 1 — Tier check

Before dispatching, check the parent's tier and the requested subagent's tier.

- **If the parent is Haiku, refuse to spawn.** Haiku-tier agents do not spawn further subagents. If a Haiku-tier task realizes it needs to delegate, the task was wrong-sized for Haiku — return work to the parent rather than spawning. Haiku is for bulk mechanical work with no judgment; the very act of needing to delegate is itself a judgment signal.
- **If the requested subagent tier is higher than the parent's tier, refuse to spawn.** Anti-escalation rule: subagents do not spawn at a higher tier than their parent. Return to the parent with a one-line user-visible justification for the tier upgrade so the parent can dispatch directly. Subagents do not silently upgrade themselves.

### Gate 2 — Depth check

Before dispatching, check the current spawn depth.

- **Maximum spawn depth is 2.** Parent → subagent → at most one more tier. Beyond that, synthesis becomes impossible to track and the parent loses any meaningful claim to "owning the final output."
- **If the current depth is 2 or greater, refuse to spawn further.** Do this work in the current agent.
- **Sibling spawns at the same depth are not capped.** A parent spawning N independent subagents in one batch is fine and encouraged — the cap is on *depth*, not *width*.

How to know the current depth: subagents are told their depth by the parent in their prompt (see "Agent Prompt Structure" — every dispatch annotates the subagent's depth). Subagents that didn't get the annotation conservatively assume they are at depth 1 and refuse further dispatch.

### Gate 3 — Justification surface

Even when Gates 1 and 2 pass, the dispatch protocol requires user-visible text **before** the Agent-tool call:

- Which subtask is being delegated.
- Why it benefits from a fresh subagent (isolation / parallelism / mechanical work).
- Which tier is being chosen and why (if not the parent's tier or below).
- How the parent will synthesize the subagent's output.

This is the right interrupt point — the user can stop a dispatch before it happens. Interrupting after the subagent is already running wastes the spawn cost.

**Bulk-batch exception:** when the parent has already established a batch ("I'm batching N file-reads to subagents") in user-visible text once in the session, subsequent dispatches in that same explicit batch may skip restating the justification. The framing covers them. New batches require new justification.

## Verification

After agents return:
1. **Review each summary** - Understand what changed
2. **Check for conflicts** - Did agents edit same code?
3. **Run full suite** - Verify all fixes work together
4. **Spot check** - Agents can make systematic errors

A worked example, the decision graph and the pattern's benefits: [reference.md](reference.md).
