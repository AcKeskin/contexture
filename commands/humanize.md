---
description: Alias for /write --humanize — flag AI texture in user-facing prose by density, then rewrite it on the write page. Never a binary verdict; refuses the model corpus.
disable-model-invocation: true
---

Run the `write` skill with `--humanize` and the same arguments.

- `/humanize` → `/write --humanize` (the draft in the recent conversation or selection)
- `/humanize README.md` → `/write --humanize README.md`
- `/humanize --no-page <pasted email>` → report and rewritten text only, no page

See `~/.claude/skills/write/SKILL.md` and `~/.claude/skills/write/humanize.md`.
