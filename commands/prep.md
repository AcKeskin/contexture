---
description: Prime the session with architectural rules (universal / language / domain / project) relevant to the current task before writing code
---

Run the `prep` skill for the current task.

Any text after `/prep` is treated as scope hints that bias scope detection. Examples:

- `/prep` — infer scope from the current task + project.
- `/prep typescript ui-components` — prime for TypeScript UI work explicitly.
- `/prep cpp rendering` — prime for C++ rendering work, overriding cwd-based inference.

The skill identifies task scope (language, domain, project, task type), calls `skills/discover/SKILL.md` with `kind: "architectural-rule"` and `render_bodies: true`, merges and caps the result (project > domain > language > universal; ≤ 20 rules; <500 tokens), reads `.claude/architecture.md` if present, and surfaces the priming block with the loaded rules so you can confirm the scope is right.

Prep also auto-fires on first substantive task of a session, first task after `/clear`, and when the user signals a topic shift. During subsequent work it observes drift and asks before proceeding outside the primed scope — never silently. On user push-back ("you violated rule X"), prep proposes a capture via `/capture` rather than writing directly.

See `~/.claude/skills/prep/SKILL.md` for the full procedure.
