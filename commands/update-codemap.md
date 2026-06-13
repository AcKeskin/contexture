---
description: Regenerate .claude/codemap.md for the current project
---

Run the `update-codemap` skill on the current project. Overwrites `.claude/codemap.md` with a fresh scan of the tree, purpose lines, and exports per language.

Full rewrite — no incremental edits. User reviews the resulting diff before committing.

See `~/.claude/skills/update-codemap/SKILL.md` for the full procedure, skip rules, and per-language extraction.
