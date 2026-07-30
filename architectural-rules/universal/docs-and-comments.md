---
name: Docs and comments
description: Comments explain why not what, one line, no rot; docs only at key moments (planning, architecture, boundaries, validation), minimal and factual.
type: user
kind: architectural-rule
scope: [comments, documentation, universal]
relevance: during-planning, during-execution, during-review, when-touching-comments
---

Both comments and docs are liabilities that rot without tests — keep them rare, precise, and triggered by need, not habit.

## Comments

A comment must answer "what non-obvious thing does this do?" or "why isn't the obvious version correct?". If it answers neither, delete it.

- <!-- id: mandatory-non-obvious --> Mandatory only when non-obvious: hidden constraints, subtle invariants, bug workarounds, surprising behavior.
- <!-- id: explain-why-not-what --> Explain **why**, not **what** — well-named identifiers show the what.
- <!-- id: one-line-preferred --> One line preferred. A paragraph signals the design needs work, not prose.
- <!-- id: no-task-tracking-comments --> Keep task-tracking out of comments — "added for X" / "fix for #123" belong in commit messages, and rot in code as it evolves.
- <!-- id: comment-decision-not-journey --> Comment the decision, not the journey. The current code is the decision; a comment makes it readable, not argues for it — so state a load-bearing rationale as a one-sentence invariant ("must be 2D — NVENC reads strides"), not the story of finding it. (Not the debugging narrative, the alternatives ruled out, or "we discussed" / "for now".)
- <!-- id: rationale-in-changelog --> Put architectural rationale and historical context in a changelog or decision record. Source comments are read every time someone touches the line; history is read only when someone needs it.
- <!-- id: docstrings-lead-contract --> Docstrings and agent-written README sections follow the same rule — lead with the contract, state what the reader needs to use it.
- <!-- id: say-what-code-cannot --> Say what the code cannot. If removing the comment wouldn't confuse a future reader, the code already said it — delete it.

**Scope:** applies only to comments you are writing, or comments on lines you are already changing. Don't open a file just to trim comments — that is out of scope for any task other than an explicit "clean up comments in <file>" request, and the churn obscures the real change in review. But if a comment or doc on a line you're already changing has become wrong, updating it is in scope — that's the line's contract staying true, not churn. Only the unprompted comment-trimming side-quest is out of scope.

## Docs

- <!-- id: docs-key-moments --> Write only at key moments: planning / design, architecture definition or change, module / system boundary definition, structural or behavioral validation.
- <!-- id: docs-load-bearing --> Docs are load-bearing only when they save future re-analysis — written continuously, they become noise.
- <!-- id: docs-layout --> Layout: a single docs root keyed by project, sub-folders for `Architecture` / `Modules` / `Stages` / `API` / `Design` / `Technical`. Root path per-user. One markdown per module / decision.
- <!-- id: docs-voice-minimal --> Voice: minimal, factual, decision-oriented — not narrative.
- <!-- id: docs-sync-code --> Keep docs in sync with the code they describe. When a change invalidates a load-bearing doc, update it in the same change or delete it. A doc that describes code as it no longer is is worse than no doc.

**Why:** comments and docs share a failure mode — both rot silently when written by habit instead of need. The discipline is the same: trigger on non-obviousness, keep terse, delete when stale.
