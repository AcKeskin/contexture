# orchestrate: reference

Not needed during a run: what this skill is not, deferred design, and how it relates to other organs.

## What this skill is NOT

- **Not a replacement for `dispatch`.** That skill owns dispatch mechanics; this one calls it.
- **Not a replacement for `using-git-worktrees`.** That skill owns single-worktree setup; the
  N-worktree registry is a deferred extension (see Deferred design).
- **Not the harvest contract.** Harvest is *what a unit learned* crossing back (State, the `harvest:`
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

## Deferred design

Future-work pieces — background-session runtime, branch-mode merge-convergence, the N-worktree registry, per-edge readiness scheduling, and the probed-but-unbuildable `SubagentStop` audit — are deferred, each with its own build trigger. None fire during an orchestrate run.

The **one load-bearing takeaway is already inline in Q4 Stage-1**: the boundary audit is an explicit **parent step**, porcelain not diff.

## Relationship to other organs

- **`dispatch`:** the dispatch engine this skill calls; every unit dispatch walks its three gates.
- **Subagent state coordination:** prompts carry the `harvest:` invitation — harvest = what a
  unit *learned*; the convergence contract = what it *produced*.
- **`using-git-worktrees`:** the isolation primitive Q2 places work into; N-worktree registry deferred.
- **Plan/execute + done-criteria:** Q1's decomposition is a lightweight
  plan over concurrent units; Q4's aggregate verification is their collective done-criteria.
- **Harness vocabulary:** Scope subsystem — this pins each unit's boundary and
  the aggregate's done-criteria.
