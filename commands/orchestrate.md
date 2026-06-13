---
description: Goal-directed orchestration & convergence for concurrent work — decompose one goal into interdependent units, place each (shared tree / worktree / serialize), fan out via dispatch, keep on track at dispatch, then verify-and-converge into one coherent result.
---

Run the `orchestrate` skill.

Forms:

- `/orchestrate` — decompose the current goal into units and run the four-question convergence protocol over them.

Examples:

- `/orchestrate` — "split this across agents and converge the results."
- Natural language: "fan this goal out", "set up worktrees for these branches", "split this across agents and bring it back together."

The skill owns the **convergence discipline** for *goal-directed* concurrency (one objective decomposed into interdependent parts that reconverge), not the failure-directed fan-out `dispatch` already covers. Four questions: **Q1 decompose** (partition into units + dependency graph; refuse to fan out a single sequential chain), **Q2 place** (per unit: shared tree / worktree-each / serialize, under the hard invariant that two concurrent units writing the same files never share a working tree), **Q3 dispatch** (delegates to `dispatch` unchanged — 027's recursion caps fire on every unit), **Q3.5 keep-on-track** (prevent-at-dispatch only — there is no mid-flight window into a running subagent; hard placement is the real scope fence, prompt fences are supplementary), **Q4 converge** (verify-then-combine: boundary audit + separate-verifier pass *then* synthesis; never trust a unit's self-reported success).

It is a **caller** of `using-git-worktrees` (isolation) and `dispatch` (the fan-out engine); it never re-implements worktree setup or dispatch mechanics.

Does not auto-fire. Not for independent-failure fan-out (that's `dispatch` directly), not single-worktree isolation (that's `using-git-worktrees` directly).

See `~/.claude/skills/orchestrate/SKILL.md` for the full procedure.
