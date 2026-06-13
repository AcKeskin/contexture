---
description: Audit code in scope against architectural rules. Report drift findings with propose-confirm-commit per fix and a feedback loop to improve the rule corpus.
---

Run the `review` skill.

Forms:

- `/review` — entire current project.
- `/review <path>` — directory (recursive) or a single file.
- `/review --since <ref>` — only files changed since the given git ref.

Examples:

- `/review` — scan the whole project for drift.
- `/review src/auth/` — scan just the auth module.
- `/review src/auth/middleware.ts` — scan a single file.
- `/review --since main` — scan files changed on the current branch.

The skill resolves scope, loads architectural rules via `skills/discover/SKILL.md` (`kind: "architectural-rule"`, `relevance_phases: ["always", "during-review"]`, `render_bodies: true`), reads `.claude/architecture.md` if present, and scans each file in scope for drift across six categories: dead code, monolithic files, SoC violations, missing pattern usage, principle violations, comment drift. Findings come with specific fixes — not "consider refactoring." Each fix is propose-confirm-commit (apply / skip / edit / view-detail) — no silent changes.

At the end of every run, the skill asks *"did this catch what you wanted?"* A "no" opens the feedback loop: sharpen an existing rule, add a new rule, retag a rule, or adjust a threshold — each routed through `/capture` so the system improves from the correction.

Does not auto-fire. Not a linter replacement, not a security audit, not a test coverage report.

See `~/.claude/skills/review/SKILL.md` for the full procedure.
