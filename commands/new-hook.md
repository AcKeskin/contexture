---
description: Scaffold a new Claude Code hook end-to-end — recipe-driven hook file, payload fixtures, runner, and settings.json registration with diff preview
---

Run the `new-hook` skill for the current context.

Any text after `/new-hook` is treated as a hint that biases recipe selection but never enough to skip the interview. Examples:

- `/new-hook` — full interview from the recipe-selection step.
- `/new-hook block writes to secrets/` — hint suggests `file-write-blocker`; skill still confirms.
- `/new-hook PreToolUse on Bash` — hint suggests `bash-command-blocker`; skill still confirms.

The skill picks a recipe (one of `bash-command-blocker`, `file-write-blocker`, `mcp-tool-blocker`, `context-injector`), prompts for a hook name, asks one question per recipe placeholder, detects whether to write into `contexture/hooks/` or `~/.claude/hooks/` based on bootstrap state, shows a settings.json diff for confirmation, and only after `y` writes the four artefacts (hook + block fixture + allow fixture + Node-based runner) and merges the registration into `~/.claude/settings.json`.

After writing, the skill spawns the runner and reports PASS/FAIL for both fixtures. Fail-noisy: artefacts stay on disk; the skill does not auto-revert.

See `~/.claude/skills/new-hook/SKILL.md` for the full procedure.
