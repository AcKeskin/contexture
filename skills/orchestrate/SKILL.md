---
name: orchestrate
description: Goal-directed orchestration & convergence for concurrent work — decompose a single goal into units, place each (shared tree / worktree / serialize), fan out via dispatch, keep on track at dispatch, then verify-and-converge into one result. Use when the user types /orchestrate or says "split this across agents", "set up worktrees for these branches", "fan this goal out". Mode A only — never auto-fires.
---

# Orchestrate

## Overview

You own the **convergence discipline** for *goal-directed* concurrency: one objective
decomposed into interdependent units that several workers handle in parallel and then
**reconverge** into one coherent result. This is the coordination job the existing organs
leave open.

- `using-git-worktrees` isolates **one** branch into one worktree. It says nothing about
 *N* concurrent workspaces or which work belongs in a worktree vs the shared tree.
- `dispatch` (027-hardened) fans out subagents for **independent
 failures** and synthesizes by **collection** ("read each summary, check for conflicts").
 That is the wrong shape for a *single goal decomposed into interdependent parts*, where
 the hard work is **convergence**, not collection.

`/orchestrate` is a **caller** of both — it adds decompose (Q1), place (Q2), keep-on-track
(Q3.5), and converge (Q4) *around* them. It never re-implements dispatch mechanics or
worktree setup.

**Two findings constrain the entire protocol** (research: `docs/findings/agent-control.md`):

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

## What this skill is NOT

- **Not a replacement for `dispatch`.** That skill owns dispatch
 mechanics (when to spawn, the hard caps, prompt structure). This skill calls it; 027's
 three gates fire on every dispatch it produces.
- **Not a replacement for `using-git-worktrees`.** That skill owns single-worktree setup.
 The N-worktree registry is a *documented, deferred* extension (see Deferred design); v1
 does not re-specify worktree creation.
- **Not.** 050 is *what a unit learned* crossing back (State, the `harvest:`
 block). This skill is *where each unit works and how the goal reconverges* (Scope). It
 *invites* harvest in its dispatch prompts, but harvest is orthogonal.
- **Not auto-fire.** Mode A throughout. Nothing auto-decomposes a goal.
- **Not a parallelizer of sequential work.** If Q1's graph is a single chain, the skill
 refuses to fan out and says so. Orchestrating a sequential goal is pure overhead.
- **Not an auto-merge / auto-resolve tool.** Q4 *surfaces* merge conflicts and unit
 contradictions; the user resolves them. No silent convergence.
- **Not a long-running daemon.** It does not poll, watch, or run in the background across
 turns. It decomposes, dispatches, and reconverges within its own turns.
- **Not Claude-Code-locked.** The unit return contract is tool-neutral — a human at a
 worktree or a non-Claude worker could fill it in by hand.

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

#### Worked example A — parallelizable (agent mode)

> **Goal:** "Research multi-agent on-track control for."
>
> **Units:**
> - U1 *platform-capability* — owns: what Claude Code's subagent surface actually exposes.
> - U2 *prior-art* — owns: orchestrator→worker control patterns across LangGraph/CrewAI/Swarm.
> - U3 *drift-control* — owns: evidence-vs-folklore on scope-fence / stuck-detection techniques.
>
> **Graph:** U1↔U2 neither (different sources), U1↔U3 neither, U2↔U3 neither — all
> parallel-safe, all read-only (no file writes that collide).
>
> **Convergence statement:** "The parent synthesizes the three verified research returns
> into one the `agent-control.md` findings file — integrative synthesis, reconciling overlap (e.g. all three
> touch the depth cap) into a single coherent source." ✔ stated → the split is real.

#### Worked example B — sequential chain (refusal)

> **Goal:** "Add a `--json` flag to the CLI: parse the flag, thread it through the formatter,
> then update the snapshot tests to match."
>
> **Units:** U1 parse flag → U2 thread through formatter (needs U1's parsed value) → U3 update
> snapshots (needs U2's new output format).
>
> **Graph:** U1→U2→U3 — a single chain; every edge is "needs output".
>
> **Verdict:** refuse. *"This goal is sequential — orchestration buys nothing; do it in one
> agent."* There is no convergence statement to make because there is nothing to reconverge.

### Q2 — Place

For each unit, decide **where the work happens**. This is the rule `using-git-worktrees`
never states because it only ever isolates one thing:

| Situation | Placement | |---|---| | Unit writes files **no other concurrent unit touches** | **Shared tree** — isolation buys nothing, costs setup. | | Two concurrent units write the **same files** | **One worktree per colliding unit**, OR **serialize** them. Never two writers in one tree. | | Unit is a different **branch / feature** entirely | **Worktree per branch** (the N-worktree extension — *deferred*, see Deferred design). | | Unit is **read-only** (investigation, no writes) | **Shared tree** — read-only units never collide. | **The hard invariant, stated once:**

> **Two concurrent units that write the same files must never share a working tree.**
> Either isolate (a worktree each) or serialize (a barrier between them). This is the
> collision-avoidance rule the rest of the harness is missing — and it is not negotiable.

**The worktree is the *enforcement*, not tidiness.** Research
(`docs/findings/agent-control.md`) found prompt-based scope fences have a
**~0% deterrent effect** — a unit told "do not write outside `src/auth/`" attempts
out-of-scope writes at the same rate as one told nothing. The only thing shown to actually
keep a unit in bounds is **hard enforcement** (allowlist / `.claudeignore` / OS-level
isolation), which beats prompt instruction **2.6–7.6×**. A separate working tree *is* that
boundary — a drifting unit physically cannot write across it. So Q2 placement carries a
second, stronger justification beyond collision-avoidance: **a worktree is the boundary a
breach can't happen across.** This is why Q3.5's prompt-level positive scope is explicitly
*supplementary* to placement, never a substitute.

**Agent-mode shared-tree safety:** in agent mode, read-only units and write-disjoint units
share the tree safely. If two concurrent units both *write* and their scopes *overlap*,
**escalate them to worktree placement automatically** (or serialize) — agent mode and branch
mode converge on the same isolation rule the moment writes collide.

#### Worked example — overlapping write claim

> Two units of one goal:
> - U1 *rename-symbol* — claims write-scope `src/payment/*.ts`.
> - U2 *add-currency-field* — claims write-scope `src/payment/model.ts`, `src/payment/api.ts`.
>
> Their claims **overlap** on `src/payment/` (U1's `*.ts` includes U2's two files). Two
> writers, same files.
>
> **Resolution:** route back through Q2. Options, in order:
> 1. **Serialize** — run U1 to completion, merge, then run U2 against the updated tree (cheapest
> if the work is quick and ordering is natural).
> 2. **Worktree each** — U1 in `worktree/rename`, U2 in `worktree/currency`, converge by merge
> in dependency order at Q4 (better if both are long-running).
>
> **Never** dispatch both into the shared tree concurrently. That violates the invariant — the
> two would race on `model.ts` and `api.ts` with no enforcement boundary between them.

### Q3 — Dispatch

Dispatch goes through **`dispatch`** — unchanged. This skill is a
*caller*, not a replacement. **027's three hard caps fire on every unit dispatch:**

1. **Gate 1 — tier check.** A Haiku parent does not spawn; a unit does not spawn at a higher
 tier than its parent.
2. **Gate 2 — depth check.** Max spawn depth 2; the dispatch prompt carries the **depth
 annotation** line. Sibling width is uncapped — N units in one batch is fine.
3. **Gate 3 — justification surface.** User-visible text *before* the dispatch: which unit,
 why a fresh subagent, which tier, how the parent will synthesize.

The dispatch prompt for each unit carries exactly **five elements** (riding alongside 027's
depth annotation):

1. **Positive scope declaration** — "you may write *only* `<files>`." Evidenced to beat
 negative fences. The unit is also *placed* (Q2) where that scope is physically enforced.
2. **Placement** — which worktree, or "shared tree" (from Q2).
3. **Step budget** — `maxTurns` (a real subagent frontmatter field; a generic count). The
 forced-BLOCKED return (Q3.5) trips when the budget is exhausted.
4. **Convergence-contract reference** — return a `produced:` block per *Unit return contract*
 above, so the parent can reassemble.
5. **`harvest:` invitation** — "if you reach a decision, lesson, or landmine
 worth keeping beyond this task, emit a `harvest:` block."

**Scope is stated positively and fenced by placement.** The prompt does *not* rely on "do NOT
touch X" — that phrasing is folklore with ~0% deterrent effect
(`docs/findings/agent-control.md`), and negative fences are dropped from
the boilerplate entirely. Positive scope guides attention; the Q2 worktree/placement is the
enforcement.

#### Worked example — one unit dispatch, 027 gates firing

> **Justification surface (Gate 3, before the call):** "Dispatching the *drift-control*
> research unit to a fresh depth-1 subagent — isolation keeps its ~70k-token source sweep out
> of my context, and it's write-disjoint from the other two units so it runs concurrently. Tier:
> same as parent (no upgrade). I'll synthesize its `produced.summary` into the `agent-control.md` findings at Q4."
>
> **Gate 1 (tier):** parent is not Haiku; unit requested at parent tier — pass.
> **Gate 2 (depth):** current depth 0 → unit is depth 1 ≤ 2 — pass; annotation line included.
>
> **Dispatch prompt:**
> ```
> You are a depth-1 subagent. Maximum allowed depth is 2. You may spawn one more level only
> if needed; beyond that, return work to your parent rather than spawning.
>
> Research evidence-based drift-control techniques for multi-agent orchestration.
>
> SCOPE (positive): you may write ONLY docs/findings/agent-control.md
> (the drift-control subsection). Placement: shared tree (read-only research + one
> write-disjoint file section).
> BUDGET: maxTurns = 12. If you exhaust it without finishing, return produced.status = blocked
> with a reason — never a confident fake.
> FIRST ACTION: restate the goal, your file-scope, and your stop-condition before any work.
> RETURN: a `produced:` block (status / scope_declared / files_changed / summary / self_check)
> per the orchestrate unit return contract.
> HARVEST: if you learn a decision, lesson, or landmine worth keeping, emit a `harvest:` block.
> ```
>
> Note what is **absent**: no "do NOT edit other files" line. The scope is positive
> ("write ONLY X"); enforcement is the placement, audited at Q4.

### Q3.5 — Keep on track

A dispatched unit runs in **isolated context with no mid-flight window** — the parent
receives one final result, never streaming progress (platform-confirmed,
`docs/findings/agent-control.md`). So "keep on track" **cannot** mean
live supervision. It means **prevent drift at dispatch** and **catch it at the cheapest
checkpoint** (Q4). Periodic mid-flight self-reporting ("step 2/4 done…") is **rejected as pure
ceremony** — the parent cannot read it live; it only appears in the post-hoc transcript.

**Four drift modes, controlled in evidence-ranked order** (cheapest + most effective first):

| Drift mode | What it looks like | Control (and *where* it bites) | |---|---|---| | **Boundary breach** | Unit writes outside its scope, collides with a sibling | **Worktree / hard placement (Q2)** — the *only* control with proven effect. Audited post-hoc at Q4 via `git diff`. | | **Scope creep** | Unit also refactors neighbours, "improves" things | **Positive scope declaration** in the prompt ("modify *only* X") + the Q4 boundary audit. | | **Goal misread** | Unit confidently solves the wrong problem | **Restate-goal-first** (unit's first output = its understanding of goal + scope + stop-condition) catches ~65–75%; the rest is caught by **Q4's separate-verifier pass**, not by self-report. | | **Silent stuck** | Unit thrashes, returns a plausible non-result | **Step budget** (`maxTurns`) + a **forced BLOCKED return** — a stuck unit returns `produced.status: blocked` with `blocked_reason` + `budget_used`, never a confident fake. | **Three disciplines** fall out — the load-bearing additions to each dispatch prompt (riding
alongside 027's depth annotation and 050's harvest invitation):

1. **State scope positively, fence with placement.** The prompt says "you may write *only*
 `<files>`" (positive), and the unit is *placed* (Q2) where that is physically enforced. It
 does **not** rely on "do NOT touch X" — folklore, ~0% deterrent. Negative phrasing is
 dropped from the boilerplate.
2. **Restate-then-act, stop-and-return on boundary.** The unit's first action restates the
 goal, its file-scope, and its stop-condition (catches goal-misread before any work). When
 it hits its boundary mid-task, it **stops and returns to the parent** for a re-scope
 decision — it **never expands scope on its own**. This is 027's anti-escalation rule
 (return to parent rather than self-upgrade) applied to *scope* instead of *tier*. Chosen
 over "expand within a budget" and "hard-fail": stop-and-return wastes no work and keeps the
 collision invariant intact.
3. **Budget the unit, force a loud failure.** Each dispatch sets `maxTurns`; the return
 contract *requires* `status: blocked` with a reason when the unit cannot finish. This
 converts "silent stuck" (the most expensive, hardest-to-detect mode) into a loud, cheap
 signal the parent acts on at Q4.

What Q3.5 deliberately does **not** do: no periodic mid-flight self-reporting (no live channel
to read it); no prompt-only scope enforcement as a primary mechanism; no trusting a unit's
self-assessed success — that is Q4's separate-verifier job ("a grader can't grade a vibe").

#### Worked example — boundary hit, stop-and-return

> The *add-currency-field* unit (placed in `worktree/currency`, scope `src/payment/model.ts`
> + `api.ts`) restates first: *"Goal: add a `currency` field to the payment model and expose
> it in the API. Scope: model.ts, api.ts. Stop-condition: field persisted + serialized + unit
> test green."* Mid-task it discovers the field also needs a migration in
> `src/db/migrations/` — **outside its scope**. It **stops and returns**:
> `produced.status: blocked`, `blocked_reason: "needs a schema migration outside declared
> scope"`, `needs: ["src/db/migrations/ added to scope, or a separate migration unit"]`. It
> does **not** silently widen its own scope and write the migration. The parent re-scopes at
> Q4 (absorb the migration into this unit's next dispatch, or spin a dependent unit).

### Q4 — Converge

This is the half neither existing organ owns. After the units return, convergence has **two
stages — verify, then combine.** The verify stage is the backstop for everything Q3.5's
dispatch-time prevention didn't catch. **A unit's self-reported success is never the verdict.**

#### Stage 1 — verify each unit (independently, not by self-report)

- **Boundary audit (a parent step).** Run `git status --porcelain --untracked-files=all` for
 the unit (or its worktree) and compare the changed-file paths against the `scope_declared`
 field of its `produced:` block. Files written outside the claim are flagged **before** any
 combine. This is a near-free, ~98%-reliable catch for boundary breach and scope creep. **It
 runs as an explicit parent step — no hook dependency, and it is the sole, load-bearing audit
 control.**
 - **Use `git status --porcelain --untracked-files=all`, not `git diff --name-only`.** A unit
 that creates *new* files leaves them **untracked**, and `git diff` ignores untracked files —
 it would report an empty diff and silently pass a real boundary breach. Porcelain with
 `--untracked-files=all` lists tracked changes *and* new files, expanded per-path. (Empirically
 confirmed during the v2 probe — see below.)
 - **Why not an automatic `SubagentStop` hook?** It was probed (orchestrate v2). The hook *does*
 fire on a unit's return and *can* derive the changed files (same porcelain command in the
 payload's `cwd`). But a `SubagentStop` hook has **no model-visible non-blocking output
 channel** — `additionalContext` is honoured for PreToolUse / PostToolUse / PostToolBatch only,
 not SubagentStop (the same constraint hit at PreCompact). So an automatic
 backstop cannot surface its advisory to the parent, and the audit stays this parent step. See
 Deferred design for the v3 trigger.
- **Separate-verifier pass.** A unit's own `self_check` is *untrusted* — self-eval is
 miscalibrated ("a grader can't grade a vibe"). For a unit whose correctness is **not
 mechanically checkable** by the aggregate suite, grade the result against the unit's success
 criteria **independently**. A unit returning `status: blocked` skips straight here — the
 parent decides re-dispatch / re-scope / absorb.

**Verifier threshold** (who grades):
- **Mechanically checkable** (compiles, suite passes, lint clean) → the **aggregate suite** is
 the verifier. No separate grader needed.
- **Not mechanically checkable** (research correctness, prose quality, design soundness) →
 the **parent grades** against the unit's stated success criteria.
- **Grade needs isolation or expertise** (large surface, specialist domain) → escalate to a
 **dispatched verifier unit** (itself a 027-gated dispatch). Use this only when parent-grading
 is genuinely insufficient — it costs a spawn.

#### Stage 2 — combine the verified units (agent mode)

Integrative **synthesis**, not collection. Unlike `dispatch`'s "read each
summary," the units shared a *goal*, so the parent must **reconcile overlaps, resolve
contradictions between unit conclusions, and produce a single artifact — not N stacked
summaries.** The convergence contract (each unit's `produced:` block) is what makes this
tractable: the parent reassembles structured pieces (`summary` + verified `files_changed`)
rather than re-parsing prose. Contradictions between units are *surfaced* for the user, never
silently resolved.

*(Branch mode — merging verified worktree branches in dependency-layer order, conflicts
surfaced not auto-resolved — is documented in Deferred design; v1 builds agent-mode only.)*

#### Worked example — agent-mode, end to end (the source-17 fan-out)

> **Goal:** "Research multi-agent on-track control" (the same goal from Q1
> example A). Three write-disjoint, read-only research units → one source file.
>
> **Dispatch (Q3):** U1 *platform-capability*, U2 *prior-art*, U3 *drift-control*, each with
> positive scope (its subsection of the `agent-control.md` findings), `maxTurns`, the `produced:` contract, and a
> `harvest:` invitation. All depth-1, parallel-safe, shared tree (read-only + write-disjoint
> sections — Q2 says no worktree needed).
>
> **Returns (Unit return contract):** each comes back with a `produced:` block (see the worked
> fixture in *Unit return contract* — U1's is shown there in full).
>
> **Stage 1 verify:**
> - *Boundary audit* — `git status --porcelain --untracked-files=all` shows each unit touched
> only `docs/findings/agent-control.md`, matching every `scope_declared`.
> No out-of-claim writes. ✔
> - *Separate-verifier* — research correctness is **not** mechanically checkable, so the parent
> grades: are the platform claims cited to official docs? Is the "~0% deterrent" claim sourced
> to a real paper, not the unit's confidence? The parent spot-checks U3's
> `[2603.20320]`/`[2508.00500]` citations rather than trusting U3's `self_check`. ✔ (Had a
> citation been unverifiable, this is where the false success is caught — not at self-report.)
>
> **Stage 2 synthesize:** the parent reconciles the three `summary` fields into **one**
> the `agent-control.md` findings file — merging the depth-cap finding all three touched into a single statement,
> ordering the corrected control hierarchy from the drift-control unit, and folding U1's
> harvested open_question into the source's "Notes / open question" section. The output is **one
> integrative artifact**, not three stacked summaries.
>
> **Aftermath:** U1's `harvest:` open_question is routed to `/recap` on Mode-A confirmation.
> This fan-out *actually happened* — three parallel research units, ~210k subagent tokens, ~80s
> wall-clock, one synthesized source — a live precedent for agent-mode convergence.

## Unit return contract

Every dispatched unit returns in a **known shape** so the parent reassembles structured
pieces instead of re-parsing prose. There are two *separately keyed* blocks:

- **`produced:`** — what the unit *did* (this section). Used by Q4 convergence.
- **`harvest:`** — what the unit *learned* (decisions / lessons /
 open_questions). Orthogonal; routed to `/capture` + `/recap` on Mode-A confirmation. A
 unit may emit one, both, or neither.

The `produced:` block is **tool-neutral and human-writable** — plain YAML with no Agent-tool
return-semantics assumption. A human at a worktree, or a Codex / Cursor worker, could fill it
in by hand. This matters for the cross-tool portability era: orchestration must not assume the
Claude Agent tool is the only worker.

```yaml
produced:
 status: done # done | blocked | partial
 scope_declared: # echo of the POSITIVE scope handed at dispatch (Q3)
 - docs/findings/agent-control.md # paths the unit was told it may write
 files_changed: # what it ACTUALLY wrote — `git status --porcelain` cross-checks this
 - docs/findings/agent-control.md
 summary: > # one paragraph: what was produced, for the parent's synthesis
 Verified the platform-capability half of the findings: no mid-flight subagent
 observability, SubagentStop/maxTurns exist, background agents are pollable peers.
 self_check: "claims verified against code.claude.com docs" # UNTRUSTED — see below
 # present only when status is blocked or partial:
 # blocked_reason: "…"
 # needs: ["…"] # what the parent must supply / re-scope to unblock
 # budget_used: "7/10 steps"
```

**Field rationale** (each traces to the spec's candidate list, validated against the fixture
below):

| Field | Why it earns its place | |---|---| | `status` | The forced-loud signal from Q3.5. `blocked`/`partial` routes straight to Q4's verifier, never a confident fake. | | `scope_declared` | The dispatch-time positive scope, echoed back so Q4's boundary audit has a comparand. | | `files_changed` | The unit's *claim* of what it wrote. **Independently cross-checked** by `git status --porcelain --untracked-files=all` at Q4 (catches new files `git diff` misses) — never trusted on its own. | | `summary` | The integrative input to Q4 Stage-2 synthesis. Prose, but bounded. | | `self_check` | The unit's self-assessed success. **Explicitly untrusted** — "a grader can't grade a vibe." Q4's separate-verifier pass overrides it. Kept only so the parent can see *what the unit thought* it did vs what the verifier finds. | | `blocked_reason` + `needs` + `budget_used` | Only when stuck. Convert "silent stuck" into a cheap, actionable signal. | **Worked fixture — one unit of the source-17 fan-out.** The research that produced
the `agent-control.md` findings *was itself* an agent-mode orchestration: three write-disjoint research units
(platform-capability / prior-art / drift-control) synthesized into one source file. Here is
the **platform-capability unit's** `produced:` block as it would return:

```yaml
produced:
 status: done
 scope_declared: ["docs/findings/agent-control.md#platform-capability"]
 files_changed: ["docs/findings/agent-control.md"]
 summary: >
 Confirmed against code.claude.com: subagents are fire-and-forget (no mid-flight
 window); SubagentStart/SubagentStop hooks exist and fire in the parent context;
 maxTurns is a real subagent frontmatter field and does not cascade from parent;
 no depth env var; background agents are pollable peer sessions, not children.
 self_check: "all six platform claims cited to official docs"
harvest:
 open_questions:
 - "Does the SubagentStop hook payload carry the unit's file changes, or only the final message?"
```

The schema is **validated, not invented**: every field was needed to express a real unit's
return, and the `summary` + `files_changed` together are exactly what Q4 reassembles. The
`harvest:` block rides alongside, separately keyed.

## Deferred design

Future-work pieces — background-session runtime, branch-mode merge-convergence, the N-worktree registry, per-edge readiness scheduling, and the probed-but-unbuildable `SubagentStop` audit — are deferred. None fire during an orchestrate run.

The **one load-bearing takeaway is already inline in Q4 Stage-1**: the boundary audit runs as an explicit **parent step** (a `SubagentStop` hook has no model-visible non-blocking channel, so it can't back this automatically), using `git status --porcelain --untracked-files=all` — *not* `git diff`, which misses new files.

## Relationship to other organs

- **`dispatch` (027):** the dispatch engine this skill calls. Every unit
 dispatch walks 027's three gates. Drift between this skill's dispatch wording and 027 is a
 flag.
- ** (subagent state coordination):** dispatch prompts carry 050's `harvest:`
 invitation. Harvest = what a unit *learned*; the convergence contract = what it *produced*.
- **`using-git-worktrees`:** the isolation primitive Q2 places work into; the N-worktree
 registry is the documented deferred extension.
- ** / 026 (plan/execute + done_criteria):** Q1's decomposition is a lightweight
 plan over concurrent units; Q4's aggregate verification is their collective done-criteria.
- ** (harness vocabulary):** Scope subsystem — this pins each unit's boundary and
 the aggregate's done-criteria.
