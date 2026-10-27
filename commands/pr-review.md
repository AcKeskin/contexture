---
description: Alias for /review --pr — review a GitHub PR from one or more angles. No GitHub posting.
---

Run the `review` skill with `--pr` and the same arguments.

- `/pr-review` → `/review --pr` (PR for the current branch)
- `/pr-review 123 src/auth/` → `/review --pr 123 src/auth/`
- `/pr-review 123 --angles auto --pack --artifact` → same flags on `/review --pr 123`

See `~/.claude/skills/review/SKILL.md`.
