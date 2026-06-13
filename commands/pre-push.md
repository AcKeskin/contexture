---
description: Run the pre-push pre-flight checklist before pushing — commits-to-ship summary, branch-name / commit-hygiene / AI-attribution / debug-artifact / hook-bypass checks; stops on any flag
---

Run the `pre-push` skill for the current branch.

The skill normally **auto-fires** when Claude is about to run `git push` — this command is the manual trigger for when you want the checklist on demand.

It surfaces the commits about to ship, runs a seven-item hygiene checklist (branch name, clean commits, no AI-attribution lines, no staged leftovers, no debug artifacts in the diff, hooks not bypassed, no carried-forward secret flag), and stops on any flag rather than pushing past it. On all-pass it confirms once and runs the exact `git push` you intended — never adding `--force` or `--no-verify` itself.

See `~/.claude/skills/pre-push/SKILL.md` for the full procedure.
