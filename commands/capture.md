---
description: Capture a memory (lesson / decision / rule / preference) with propose-confirm-commit flow
---

Run the `capture` skill for the current context.

Any text after `/capture` is treated as the candidate memory content. Examples:

- `/capture` — infer content from the recent conversation; ask one clarifying question if multiple candidates.
- `/capture services always wrap repositories in this project` — use that text as the rule.
- `/capture remember that parseDate returns null on empty string, not throw` — lesson-shaped.

The skill classifies `type`, `kind`, `scope`, and `relevance`, drafts the full frontmatter and body, and shows it for user confirmation before writing. Accept / edit / reject. Mode B (auto-capture) is parked — nothing fires without explicit invocation.

See `~/.claude/skills/capture/SKILL.md` for the full procedure.
