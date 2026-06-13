---
description: Scaffold a new MCP server project under mcps/ — interview-driven, supports TypeScript and Python, simple tool servers and API wrappers. Writes project files, installs dependencies, builds, and registers in ~/.claude.json with diff preview.
---

Run the `new-mcp` skill for the current context.

Any text after `/new-mcp` is treated as a hint that biases choices but never enough to skip the interview. Examples:

- `/new-mcp` — full interview from the language-choice step.
- `/new-mcp weather API in TypeScript` — hint suggests TS + API wrapper; skill still confirms.
- `/new-mcp simple python calculator` — hint suggests Python + simple; skill still confirms.

The skill picks a language (TypeScript or Python), a flavor (simple tool server or API wrapper), prompts for a server name and tool definitions, detects registration scope, shows a `~/.claude.json` diff for confirmation, and only after `y` writes the project files, installs dependencies, builds, and registers the MCP server.

After writing, the skill runs the build and reports success/failure. Fail-noisy: artifacts stay on disk; the skill does not auto-revert.

See `~/.claude/skills/new-mcp/SKILL.md` for the full procedure.
