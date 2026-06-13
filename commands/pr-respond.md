---
description: Structure responses to PR review comments — group by theme, decide accept/push-back/clarify/already-done, apply local code changes, and draft GitHub replies for you to post (never posts itself)
---

Run the `pr-respond` skill for the current PR.

The skill normally **auto-fires** when Claude reads PR comments and is about to act on them — this command is the manual trigger.

It fetches the open review comments, groups them by theme, and presents an editable disposition table (one row per comment, no comment silently dropped). On your confirmation it **applies and stages local code changes** for Accept rows — reading any ` ```suggestion ` block from the reviewer as the pre-drafted change — and **drafts** the GitHub replies for Push-back / Clarify / Already-done rows, handing them to you to post. **It never posts to GitHub** and never resolves a thread.

See `~/.claude/skills/pr-respond/SKILL.md` for the full procedure.
