---
description: Execute the active plan for a slug under .claude/plans/<slug>/, one step at a time, with verification after each. Prompts on failure; never advances silently.
---

Run the `execute` skill.

Forms:

- `/execute` (no slug) — resolve in this order: (1) if `default` is active in `.claude/plans/INDEX.md`, use it; (2) else if exactly one named active plan exists, use it; (3) else list active slugs and ask.
- `/execute <slug>` — execute the active plan for `<slug>` (resolved from `.claude/plans/INDEX.md`).
- `/execute <slug> --from N` — start from step N (skip earlier steps).
- `/execute <path>` — explicit path to a specific plan version file (e.g. `.claude/plans/auth-rework/v2.md`). Bypasses INDEX. Useful for re-executing a superseded plan or running a `draft` plan.

**Legacy fallback:** if `<slug>` resolves to nothing AND `$CLAUDE_PROJECT_DIR/PLAN.md` exists at project root, the skill reads it with a one-time deprecation note.

Does not auto-fire. Verification evidence is required before each step is marked done. On verification failure, the skill stops and asks — no silent advance.

See `~/.claude/skills/execute/SKILL.md` for the full procedure.
