---
description: Manage the architectural-rule overlay — list / disable / enable / edit / sync / where across shipped / company / user / project tiers
---

Run the `rules` skill for the architectural-rule overlay system.

Text after `/rules` is the subcommand. Examples:

- `/rules list` — show the effective corpus, grouped by tier, non-default rules annotated.
- `/rules where csharp/naming` — explain how one rule resolves (which tier wins, why).
- `/rules edit csharp/naming` — create/open a user override (whole-file or field patch).
- `/rules disable web/state [--project | --session]` — turn a rule off at the chosen scope.
- `/rules enable web/state` — undo a disable.
- `/rules sync` — clone/pull the company rules repo per the manifest.

Every mutating subcommand previews the before→after effect on the effective corpus and confirms before writing. Mode A only — never auto-fires.

See `~/.claude/skills/rules/SKILL.md` for the full procedure and `~/.claude/docs/architectural-rules-overlay.md` for the model.
