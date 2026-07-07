---
description: Set or show the goal-directed autonomy contract (effort / stopping / ask) that the workflow organs read at their decision points — how hard to push, when to stop, when to ask. Propose-confirm, never auto-fires.
---

Run the `autonomize` skill for the current context.

Forms:

- `/autonomize` — with a contract set, show the active contract + its source tier and offer to edit; with none set, run the short contract-establishing interview.
- `/autonomize effort=thorough stopping=criteria-met ask=forks-only` — kickoff: propose those values, confirm, write the task contract. No interview.
- `/autonomize <natural-language steer>` — e.g. "leave it here", "go deeper", "keep pushing": map to a contract delta, propose-confirm, apply for the current task only.

`effort` ∈ minimal | balanced | thorough | exhaustive · `stopping` ∈ criteria-met | diminishing-returns | budget | user-anytime · `ask` ∈ forks-only | every-step | until-blocked.

A live steer is task-scoped and never persists. Every write passes propose-confirm; the skill never auto-fires.

See `~/.claude/skills/autonomize/SKILL.md` for the full contract model and precedence.
