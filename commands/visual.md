---
description: Visual organ for UI projects. One design contract (tokens, references, screen states), captures by named state, deterministic checks, and a fresh critic that decides within the contract while you review after.
---

Run the `visual` skill.

- `/visual setup` — write the design contract for this repo: canonical tokens, references, screen states, capture commands, tells, critic settings.
- `/visual audit` — capture every state and list visual gaps against the contract (finds, never fixes).
- `/visual verify <run>` — inside a cycle run: capture what the change touched, before and after, for the critic.
- `/visual rollback <state>` — restore an earlier baseline.

The critic always runs as its own session with a brief built from files, so the session that made a change never judges it. Review its decisions on the cycle status page, where you can agree, disagree, or roll a baseline back.
