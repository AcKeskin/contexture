---
description: Review a GitHub Pull Request — fetch diff via gh, analyze for correctness/bugs, design/patterns, PR hygiene, and security. Present structured findings locally. No GitHub posting.
---

Run the `pr-review` skill.

Forms:

- `/pr-review` — auto-detect PR from the current branch.
- `/pr-review <number>` — review a specific PR by number.
- `/pr-review <number> <path...>` — review only the given paths within the PR.

Examples:

- `/pr-review` — review the PR associated with the current branch.
- `/pr-review 123` — review PR #123.
- `/pr-review 123 src/auth/` — review only auth-related changes in PR #123.
- `/pr-review 456 src/api/ src/services/` — review api and services changes in PR #456.

The skill fetches PR data via `gh pr view` and `gh pr diff`, asks whether to load architectural rules via `skills/discover/SKILL.md` and whether the user has specific guidelines or context, then scans the diff across four categories: code correctness & bugs, design & patterns, PR hygiene, and security. Findings are grouped by file with severity and concrete suggestions, followed by a summary table and an actionable review checklist. Output is local only — no comments are posted to GitHub.

Does not auto-fire. Not a replacement for `/review` (which audits local code for architectural drift).

See `~/.claude/skills/pr-review/SKILL.md` for the full procedure.
