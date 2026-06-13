---
description: Draft a PR title + body to a clean contract (Summary + Test plan + Closes-line over any existing template) and hand you a ready-to-run gh pr create command — never opens the PR itself
---

Run the `pr-author` skill for the current branch.

The skill normally **auto-fires** when Claude is about to run `gh pr create` or right after a first push with no open PR — this command is the manual trigger.

It resolves the base branch (fork-aware), drafts a title (≤70 chars, format-conformant) and a body (Summary + Test plan + Closes-line, layered on any existing `.github` PR template), shows you the draft, and hands you the exact `gh pr create` command with the body written to a temp file. **It never runs the gh write** — opening the PR is your action.

See `~/.claude/skills/pr-author/SKILL.md` for the full procedure.
