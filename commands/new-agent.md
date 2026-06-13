---
description: Scaffold a new Claude Code subagent under agents/ — interview-driven, forces job-to-be-done, pre-flight questions, anti-patterns, and debugging workflow. Writes one .md file with full structure and a settings/MEMORY.md side-effect-free preview.
---

Run the `new-agent` skill for the current context.

Any text after `/new-agent` is a hint that biases the interview but never enough to skip it. Examples:

- `/new-agent` — full interview from scratch.
- `/new-agent metal video source` — hint pre-fills the domain question; skill still confirms.
- `/new-agent rust async runtime expert` — hint pre-fills name and scope; skill still confirms every required field.

The skill walks through nine stages: name + slug, job-to-be-done, scope (language/platform/framework), tool allowlist, model choice, pre-flight questions the agent must always ask, anti-patterns (specific landmines), debugging workflow, output contract. It then composes the full agent file with all sections, shows a preview, asks for confirmation, writes to `agents/<name>.md`, and reminds the user that bootstrap propagates it to `~/.claude/agents/`.

Mode A only — never auto-fires. The whole point is to push the user to articulate what makes this agent worth having beyond a generic coder.

See `~/.claude/skills/new-agent/SKILL.md` for the full procedure.
