---
name: Change discipline
description: Surface assumptions before coding. Surgical edits — no adjacent improvements. Goal-driven, verify each step.
type: user
kind: architectural-rule
scope: [change-discipline, universal]
relevance: always
---

- Surface assumptions before coding. State them; if multiple interpretations exist, present them; if a simpler approach exists, say so. Do not silently pick.
- Surgical edits. Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style even if you'd write it differently.
- No unrequested scope. Build the minimal thing that satisfies the request — don't add configurability, abstraction, options, or features the user didn't ask for. When a broader or configurable design tempts you, *propose it and get confirmation* before building; never bake speculative generality in. Over-building costs a full revert.
- Clean up only your own mess. Remove imports / variables / functions that *your* changes orphaned. Do not delete pre-existing dead code unless asked — flag it, don't act.
- Every changed line traces to the user's request.
- Goal-driven execution. Translate vague tasks into verifiable goals — "add validation" → "tests for invalid inputs, then make them pass." For multi-step tasks, state plan with per-step verification before starting.

**Why:** code-standards covers *what* good code looks like; this rule covers *how* changes are made. The two failure modes are different — the first produces bad code, the second produces drift in adjacent code that no one asked for.
