---
description: Audit the project's memory tree for drift — orphans, duplicates, broken relations, stale references, schema gaps. Read-only by default; proposes fixes via propose-confirm-commit. Sibling of /review for memory rather than code.
---

Run the `memory-audit` skill.

Forms:

- `/memory-audit` — audit the current project's memory tree at `~/.claude/projects/<slug>/memory/`.
- `/memory-audit --project <slug>` — audit a specific project's memory tree (other than the current one).
- `/memory-audit --check <dimension>` — run only one of the eight dimensions (faster iteration when the user knows what they're looking for).

The skill scans the memory tree and reports drift findings across eight integrity dimensions: MEMORY.md index drift, frontmatter validity, broken `relations:` links, duplicate detection, stale references (paths / commit hashes / proposal IDs that no longer resolve), orphan files, superseded memories still surfacing, and session-recap schema. Each concrete finding cites a file path and (where applicable) a line number.

Fixes flow through propose-confirm-commit per finding (apply / skip / edit / view-detail) — no silent writes. Read-only by default; user always makes the call.

Strong candidate for `/schedule` (weekly cadence) per the recurring-task offer pattern.

Does not auto-fire. Not a backup, not a memory editor, not a continuous monitor, not a similarity engine (text overlap on first paragraph, not embeddings).

See `~/.claude/skills/memory-audit/SKILL.md` for the full procedure.
