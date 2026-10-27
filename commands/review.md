---
description: Review local code or a GitHub PR from one or more angles — rule drift locally, correctness/design/hygiene/security on a PR, plus any angle you add. Ends with your pick, a walk, a review page or an Obsidian note.
---

Run the `review` skill.

Targets:

- `/review` — whole project. `/review <path>` — a directory or file. `/review --since <ref>` — files changed since a ref.
- `/review --pr [N] [path…]` — a GitHub PR (`/pr-review` is an alias).

Flags (combine with any target):

- `--angles [list|auto|all]` — e.g. `--angles performance,extensibility`. One fresh reviewer per angle; findings are merged, ranked, and conflicts shown as trade-offs. Projects add angles in `.claude/review-angles.md`.
- `--pack` — a plain-language pack first: metrics, structure, call flow, how to build on it, performance.
- `--artifact` — open the review as a page (Claude artifact, or a local HTML file).
- `--vault` — write an Obsidian note with tick-box picks.

Examples:

- `/review src/auth/` — rule-drift audit of the auth module.
- `/review --since main --angles auto` — drift plus 3–4 angles picked from the diff.
- `/review --pr 123 --angles perf,extensibility --pack --artifact`

You see metrics and the big picture first; the model does the call tracing. Pick what to keep in one line, `walk` through findings one by one, or pick on the page or in the vault note. Local reviews then apply the kept fixes with your confirmation and ask whether the review caught what you wanted. Nothing is posted to GitHub.

See `~/.claude/skills/review/SKILL.md` for the full procedure.
