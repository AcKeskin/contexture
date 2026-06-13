---
name: Docs and comments
description: Comments explain why not what, one line, no rot; docs only at key moments (planning, architecture, boundaries, validation), minimal and factual.
type: user
kind: architectural-rule
scope: [comments, documentation, universal]
relevance: during-planning, during-review
---

Both comments and docs are liabilities that rot without tests — keep them rare, precise, and triggered by need, not habit.

## Comments

A comment must answer "what non-obvious thing does this do?" or "why isn't the obvious version correct?". If it answers neither, delete it.

- Mandatory only when non-obvious: hidden constraints, subtle invariants, bug workarounds, surprising behavior.
- Explain **why**, not **what** — well-named identifiers show the what.
- One line preferred. A paragraph signals the design needs work, not prose.
- No task-referential comments ("added for X", "fix for #123") — those belong in commit messages and rot as code evolves.
- No play-by-play. Don't narrate the debugging journey, what you tried first, or alternatives you ruled out. No "we discussed" / "decided not to" / "for now" / "originally". The current code is the decision; the comment makes it readable, not argues for it. If rationale is load-bearing, state the invariant in one sentence ("must be 2D — NVENC reads strides"), not the story of finding it.
- Architectural rationale and historical context belong in a changelog or decision record, not source comments. Source comments are read every time someone touches the line; history is read only when someone needs it.
- Same rules apply to docstrings and agent-written README sections — lead with the contract, don't recap the design conversation.
- No redundancy with code. If removing the comment doesn't confuse a future reader, delete it.

**Scope:** applies only to comments you are writing, or comments on lines you are already changing. Don't open a file just to trim comments — that is out of scope for any task other than an explicit "clean up comments in <file>" request, and the churn obscures the real change in review. But if a comment or doc on a line you're already changing has become wrong, updating it is in scope — that's the line's contract staying true, not churn. Only the unprompted comment-trimming side-quest is out of scope.

## Docs

- Write only at key moments: planning / design, architecture definition or change, module / system boundary definition, structural or behavioral validation.
- Docs are load-bearing only when they save future re-analysis — written continuously, they become noise.
- Layout: a single docs root keyed by project, sub-folders for `Architecture` / `Modules` / `Stages` / `API` / `Design` / `Technical`. Root path per-user. One markdown per module / decision.
- Voice: minimal, factual, decision-oriented — not narrative.
- Keep docs in sync with the code they describe. When a change invalidates a load-bearing doc, update it in the same change or delete it. A doc that describes code as it no longer is is worse than no doc.

**Why:** comments and docs share a failure mode — both rot silently when written by habit instead of need. The discipline is the same: trigger on non-obviousness, keep terse, delete when stale.
