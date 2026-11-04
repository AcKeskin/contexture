---
name: orchestrate
description: "Goal-directed orchestration and convergence for concurrent work: turns one goal into parallel agent work and verifies it back into one result. Use on /orchestrate or when the user asks to split a goal across agents or set up worktrees for several branches. Mode A only — never auto-fires."
---

# Orchestrate

## Overview

You own the **convergence discipline** for *goal-directed* concurrency: one objective
decomposed into interdependent units that several workers handle in parallel and then
**reconverge** into one coherent result. This is the coordination job the existing organs
leave open.

- `using-git-worktrees` isolates **one** branch into one worktree. It says nothing about
  *N* concurrent workspaces or which work belongs in a worktree vs the shared tree.
- `dispatch` fans out subagents for **independent
  failures** and synthesizes by **collection** ("read each summary, check for conflicts").
  That is the wrong shape for a *single goal decomposed into interdependent parts*, where
  the hard work is **convergence**, not collection.

`/orchestrate` is a **caller** of both — it adds decompose (Q1), place (Q2), keep-on-track
(Q3.5), and converge (Q4) *around* them. It never re-implements dispatch mechanics or
worktree setup.

**Two research findings constrain the entire protocol:**

1. **No mid-flight window.** A dispatched subagent returns one final result — the parent
   cannot stream its progress. So keep-on-track is **prevent-at-dispatch**, never live
   supervision.
2. **Prompt scope fences have ~0% deterrent effect.** A unit told "do not write outside X"
   attempts out-of-scope writes at the same rate as one told nothing. **Hard placement** (a
   worktree / allowlist) is the only real scope enforcement — it outperforms prompt
   instruction 2.6–7.6×. Positive scope in the prompt is *supplementary attention-guidance*;
   negative "do NOT" fences are dropped from the boilerplate entirely.

**Announce at start:** "I'm using the orchestrate skill to fan this goal out and converge it."

## When to run

**Mode A — manual only. Never auto-fires.** Fanning a goal across agents or worktrees is
expensive; the user must opt in.

- User types `/orchestrate`.
- Natural language: "split this across agents", "set up worktrees for these branches", "fan
  this goal out", "run these in parallel and combine".

**Do not** auto-decompose a goal, auto-fire on session start, or run on any hook.

## The protocol

`/orchestrate` walks four questions plus a keep-on-track discipline, surfacing decisions
rather than acting silently:

```
Q1 DECOMPOSE → Q2 PLACE → Q3 DISPATCH → (Q3.5 KEEP ON TRACK) → Q4 CONVERGE
```

### Q1 — Decompose

**Is this goal *actually* parallelizable?** Before fanning out, force the decomposition to
be explicit and test it (the inverse of `dispatch`'s independence test,
applied to *one goal* instead of *many failures*).

1. **Partition the goal into units.** Each unit gets a **one-line boundary statement** — what
   it owns, in plain words.
2. **Build the unit dependency graph.** For each *pair* of units, ask one question:
   - Does B need A's **output**? → **sequential** (the graph has layers; parallelize within a
     layer, barrier between layers).
   - Does B touch A's **files**? → **collision risk** → route to Q2 (isolate or serialize).
   - **Neither**? → **parallel-safe**, dispatch concurrently.
3. **State the convergence.** Q1's required output is a **convergence statement**: *how the
   units come back together* — merge (branches) or integrative synthesis (agents). This is the
   **deletion test applied to orchestration**: if you cannot say how the pieces reconverge,
   the split was not real — stop and re-decompose. A goal-directed fan-out earns its
   complexity only at convergence.

**Refuse to fan out a sequential chain.** If every unit depends on the prior (a single
chain), say so plainly and stop:

> This goal is sequential, not parallel — every step needs the previous step's output.
> Orchestration buys nothing here; do it in one agent. (Refusing to fan out a sequential
> goal is the right call, not a failure.)

#### Worked example — sequential chain (refusal)

> **Goal:** "Add a `--json` flag": parse flag → thread through formatter → update snapshots.
> A single chain — every edge is "needs output". Refuse; nothing to reconverge.

### Q2 — Place

For each unit, decide **where the work happens**. This is the rule `using-git-worktrees`
never states because it only ever isolates one thing:

| Situation | Placement |
|---|---|
| Unit writes files **no other concurrent unit touches** | **Shared tree** — isolation buys nothing, costs setup. |
| Two concurrent units write the **same files** | **One worktree per colliding unit**, OR **serialize** them. Never two writers in one tree. |
| Unit is a different **branch / feature** entirely | **Worktree per branch** (the N-worktree extension — *deferred*, see Deferred design). |
| Unit is **read-only** (investigation, no writes) | **Shared tree** — read-only units never collide. |

**The hard invariant, stated once:**

> **Two concurrent units that write the same files must never share a working tree.**
> Either isolate (a worktree each) or serialize (a barrier between them). This is the
> collision-avoidance rule the rest of the harness is missing — and it is not negotiable.

**The worktree is the *enforcement*, not tidiness.** Beyond collision-avoidance, **a
worktree is the boundary a breach can't happen across** (see Overview finding 2) — which is
why Q3.5's prompt-level positive scope is *supplementary* to placement, never a substitute.

**Agent-mode shared-tree safety:** in agent mode, read-only units and write-disjoint units
share the tree safely. If two concurrent units both *write* and their scopes *overlap*,
**escalate them to worktree placement automatically** (or serialize) — agent mode and branch
mode converge on the same isolation rule the moment writes collide.

#### Worked example — overlapping write claim

> U1 *rename-symbol* claims `src/payment/*.ts`; U2 *add-currency-field* claims
> `src/payment/model.ts` + `api.ts` — two writers, same files. Serialize (U1, merge, then U2)
> or worktree each and merge in dependency order at Q4. **Never** both in the shared tree.

### Q3 — Dispatch

Dispatch goes through **`dispatch`** — unchanged. This skill is a *caller*, not a
replacement. **dispatch's three gates fire on every unit dispatch** — model tier (a Haiku
parent does not spawn; no unit above its parent's tier), depth ≤ 2 (the prompt carries the
depth annotation line), and a user-visible justification surface before the call — see
dispatch/SKILL.md. Sibling width is uncapped.

The dispatch prompt for each unit carries exactly **six elements** (riding alongside dispatch's
depth annotation):

1. **Positive scope declaration** — "you may write *only* `<files>`." Evidenced to beat
   negative fences. The unit is also *placed* (Q2) where that scope is physically enforced.
2. **Placement** — which worktree, or "shared tree" (from Q2).
3. **Step budget** — `maxTurns`, scaled to the autonomy contract's `effort` per dispatch's
   *Autonomy contract at dispatch* section (dispatch owns the scaling; set it explicitly per
   unit — it does not cascade). The forced-BLOCKED return (Q3.5) trips when the budget is
   exhausted.
4. **Convergence-contract reference** — return a `produced:` block per the *Unit return
   contract* section, so the parent can reassemble.
5. **`harvest:` invitation** — "if you reach a decision, lesson, or landmine
   worth keeping beyond this task, emit a `harvest:` block."
6. **Ask posture** — the contract's `ask` posture per dispatch's *Autonomy contract at
   dispatch* section. Read at dispatch only (the platform has no model-visible mid-flight
   channel) — never streamed in.

The unit's task content itself takes dispatch's *delegation brief* shape (Goal · Files ·
Constraints · Acceptance · Verify, pointers not pastes) — dispatch owns that contract;
these six elements ride alongside it.

**Scope is stated positively and fenced by placement** — see Overview finding 2. Positive
scope guides attention; the Q2 worktree/placement is the enforcement.

#### Worked example — one unit dispatch, dispatch gates firing

> Justification surfaced before the call (Gate 3): "Dispatching the *drift-control* research
> unit to a fresh depth-1 subagent — write-disjoint from the other two, tier same as parent;
> I'll synthesize its `produced.summary` at Q4." Gates 1–2 pass (parent not Haiku; depth 1 ≤ 2).
>
> **Dispatch prompt:**
> ```
> You are a depth-1 subagent. Maximum allowed depth is 2. You may spawn one more level only
> if needed; beyond that, return work to your parent rather than spawning.
>
> Research evidence-based drift-control techniques for multi-agent orchestration.
>
> SCOPE (positive): you may write ONLY docs/findings/<topic>.md
>   (the drift-control subsection). Placement: shared tree (read-only research + one
>   write-disjoint file section).
> BUDGET: maxTurns = 12. If you exhaust it without finishing, return produced.status = blocked
>   with a reason — never a confident fake.
> FIRST ACTION: restate the goal, your file-scope, and your stop-condition before any work.
> RETURN: a `produced:` block (status / scope_declared / files_changed / summary / self_check)
>   per the orchestrate unit return contract.
> HARVEST: if you learn a decision, lesson, or landmine worth keeping, emit a `harvest:` block.
> ```

### Q3.5 — Keep on track

A dispatched unit runs in **isolated context with no mid-flight window** (Overview finding 1),
so "keep on track" means **prevent drift at dispatch** and **catch it at the cheapest
checkpoint** (Q4). Periodic mid-flight self-reporting ("step 2/4 done…") is **rejected as pure
ceremony** — the parent cannot read it live.

The waiting itself is zero-token: between dispatch and return the parent does not poll, check
in, or narrate progress — unit completion (the harness's task notification) wakes it. A
**consult return** is not mid-flight supervision and stays compatible with finding 1: it is a
normal *return* (`produced.status: blocked` carrying one specific question + evidence, per
dispatch's *Consult returns* section) that the parent answers tersely and re-dispatches — one
guidance round at a time, capped at two per unit, never a streamed conversation.

**Four drift modes, controlled in evidence-ranked order** (cheapest + most effective first):

| Drift mode | What it looks like | Control (and *where* it bites) |
|---|---|---|
| **Boundary breach** | Unit writes outside its scope, collides with a sibling | **Worktree / hard placement (Q2)** — the only proven control (finding 2). Audited post-hoc at Q4's boundary audit. |
| **Scope creep** | Unit also refactors neighbours, "improves" things | **Positive scope declaration** in the prompt ("modify *only* X") + the Q4 boundary audit. |
| **Goal misread** | Unit confidently solves the wrong problem | **Restate-goal-first** (unit's first output = its understanding of goal + scope + stop-condition) catches ~65–75%; the rest is caught by **Q4's separate-verifier pass**, not by self-report. |
| **Silent stuck** | Unit thrashes, returns a plausible non-result | **Step budget** (`maxTurns`) + a **forced BLOCKED return** — a stuck unit returns `produced.status: blocked` with `blocked_reason` + `budget_used`, never a confident fake. |

**Three disciplines** fall out — the load-bearing additions to each dispatch prompt (riding
alongside dispatch's depth annotation and the harvest invitation):

1. **State scope positively, fence with placement.** The prompt says "you may write *only*
   `<files>`" (positive), and the unit is *placed* (Q2) where that is physically enforced.
   Never "do NOT touch X" — negative fences stay out of the boilerplate (finding 2).
2. **Restate-then-act, stop-and-return on boundary.** The unit's first action restates the
   goal, its file-scope, and its stop-condition (catches goal-misread before any work). When
   it hits its boundary mid-task, it **stops and returns to the parent** for a re-scope
   decision — it **never expands scope on its own**. This is dispatch's anti-escalation rule
   (return to parent rather than self-upgrade) applied to *scope* instead of *tier*. Chosen
   over "expand within a budget" and "hard-fail": stop-and-return wastes no work and keeps the
   collision invariant intact.
3. **Budget the unit, force a loud failure.** Each dispatch sets `maxTurns`; the return
   contract *requires* `status: blocked` with a reason when the unit cannot finish. This
   converts "silent stuck" (the most expensive, hardest-to-detect mode) into a loud, cheap
   signal the parent acts on at Q4.

What Q3.5 deliberately does **not** do: no prompt-only scope enforcement as a primary
mechanism; no trusting a unit's self-assessed success — that is Q4's separate-verifier job
("a grader can't grade a vibe").

#### Worked example — boundary hit, stop-and-return

> The *add-currency-field* unit discovers it needs a migration in `src/db/migrations/` —
> outside its declared scope. It returns `produced.status: blocked` with `blocked_reason` +
> `needs`, never silently widening its scope; the parent re-scopes at Q4.

### Q4 — Converge

After the units return, read [converge.md](converge.md) and follow it: verify each unit first (a unit's self-report is never the verdict), then combine. The autonomy contract's `stopping` posture decides whether Q4 pushes to completeness or freezes a coherent best-so-far; it never changes the verify step.

## Unit return contract

Every unit returns a `produced:` block (status, scope_declared, files_changed, summary, self_check; blocked_reason and needs when not done) and may add a `harvest:` block. The schema to paste into each dispatch prompt is in [unit-contract.md](unit-contract.md).

What this skill is not, deferred design, and related organs: [reference.md](reference.md).
