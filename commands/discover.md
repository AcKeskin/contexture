---
description: Load relevant stored memories and codemap entries for the current task
---

Run the `discover` skill for the current task.

Any text after `/discover` is treated as additional task keywords. Examples:

- `/discover` — use the most recent user message as the task.
- `/discover auth refactor` — add `auth` and `refactor` to the task keywords.

The skill reads the project's MEMORY.md index, filters by scope/relevance/kind, consults `.claude/codemap.md` if present, and reports what it found. If coverage is thin, it escalates with up to 3 targeted questions before proceeding.

See `~/.claude/skills/discover/SKILL.md` for the full procedure.
