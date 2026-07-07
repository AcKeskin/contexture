---
description: Alias for /work-state — report a slug's position in the scope chain (envision→spec→draft-plan→blueprint→execute→archive) as deterministic structured state. Read-only.
---

Alias for `/work-state`. Run the `work-state` skill for the given slug.

The text after `/status` is the slug to inspect. Examples:

- `/status auth` — where `auth` sits in the scope chain + its next action.
- `/status` — infer the slug from recent context if unambiguous, else ask.

See `~/.claude/skills/work-state/SKILL.md` for the full procedure.
