---
description: List every `shortcut:` marker in the project, grouped by file, so cut corners can be paid down or filed.
disable-model-invocation: true
---

Run the `shortcuts` skill for the current project.

- `/shortcuts` lists markers under the current directory.
- `/shortcuts src/billing/` lists one subtree.

Markers come from the `mark-shortcuts` rule: `// shortcut: <what was cut>; <when to fix>`. Read-only. See `~/.claude/skills/shortcuts/SKILL.md`.
