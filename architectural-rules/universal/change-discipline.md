---
name: Change discipline
description: Surface assumptions before coding. Surgical edits — no adjacent improvements. Goal-driven, verify each step.
type: user
kind: architectural-rule
scope: [change-discipline, universal]
relevance: always
---

- <!-- id: surface-assumptions --> Surface assumptions before coding. State them; if the ask reads several ways or a simpler approach exists, say so. Do not silently pick.
- <!-- id: surgical-edits --> Surgical edits. Don't improve adjacent code, comments or formatting, or refactor what isn't broken. Match the existing style.
- <!-- id: no-unrequested-scope --> No unrequested scope. Build the minimal thing asked for: no extra configurability, abstraction, options or features. If a broader design tempts you, propose it and get confirmation first.
- <!-- id: clean-own-mess --> Clean up only your own mess: remove imports, variables and functions your change orphaned. Flag pre-existing dead code; don't delete it unless asked.
- <!-- id: every-line-traced --> Every changed line traces to the user's request.
- <!-- id: goal-driven-execution --> Goal-driven execution. Turn vague tasks into verifiable goals ("add validation" → tests for invalid inputs, then make them pass). For multi-step work, state the plan with a check per step first.

**Why:** code-standards covers what good code looks like; this covers how changes are made. Bad code and unrequested drift in adjacent code are different failures.
