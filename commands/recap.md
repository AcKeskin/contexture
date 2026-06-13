---
description: Write an end-of-session recap — request / investigated / learned / completed / next-steps — with propose-confirm-commit flow and optional promotion of Learned items
---

Run the `recap` skill for the current session.

Any text after `/recap` is treated as a short title for the recap. Examples:

- `/recap` — infer title from the session's primary goal.
- `/recap 013-session-recaps-ship` — use that as the title/slug.
- `/recap auth middleware rewrite` — free-form prose title; skill slugs it.

The skill gathers the session's context (files touched, commits produced, corrections and decisions, learnings, pending work), drafts a full recap (frontmatter + structured body), and shows it for user confirmation. Accept / edit / reject. On accept, the file lands under `~/.claude/projects/<slug>/memory/sessions/YYYY-MM-DD-<slug>.md` and a promotion pass offers to capture non-trivial `Learned` items as rule-tier memories.

Never auto-fires. Mode B (silent session-end capture) is parked — every recap is explicit and user-confirmed.

See `~/.claude/skills/recap/SKILL.md` for the full procedure.
