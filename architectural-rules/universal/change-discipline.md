---
name: Change discipline
description: Surface assumptions before coding. Surgical edits — no adjacent improvements. Goal-driven, verify each step.
type: user
kind: architectural-rule
scope: [change-discipline, universal]
relevance: always
---

- <!-- id: surface-assumptions --> Before the first edit, state your assumptions, including how the code handles any failure mode the request names (duplicates, retries, crashes, concurrency, time boundaries). If that changes the interface, adds storage or decides who owns it, ask first. The final report is too late.
- <!-- id: smallest-change --> Smallest complete change: needed at all? Already in the repo? Stdlib or an installed package? Then the shortest diff that fully works.
- <!-- id: surgical-edits --> Surgical edits: don't touch adjacent code, comments or formatting. Match the existing style.
- <!-- id: no-unrequested-scope --> No unrequested scope: no extra configurability, abstraction, options or features. Propose a broader design and get confirmation first.
- <!-- id: clean-own-mess --> Remove only what your change orphaned. Flag pre-existing dead code; don't delete it unless asked.
- <!-- id: every-line-traced --> Every changed line traces to the user's request.
- <!-- id: goal-driven-execution --> Goal-driven: turn vague tasks into verifiable goals ("add validation" → tests for invalid inputs, then pass them). For multi-step work, state the plan with a check per step first.

**Why:** code-standards covers what good code looks like; this covers how changes are made.
