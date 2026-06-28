---
description: Append a dated line to the project's canonical CHANGELOG.md (the "what shipped, newest first" record) via propose-confirm — one writer, several callers
---

Run the `update-changelog` skill for the current context.

Any text after `/update-changelog` describes the shipped unit or significant change. Examples:

- `/update-changelog` — infer the just-shipped unit or significant planning change from the recent conversation; ask one clarifying question if multiple candidates.
- `/update-changelog 095 changelog-ledger shipped` — log a ship line (`✓`) for a shipped unit of work.
- `/update-changelog spec'd changelog-ledger` — log a decision line (`◆`) for a significant planning-artifact change.

The skill reads `docs/changelog-contract.md`, resolves the target `CHANGELOG.md` (project root, else `.claude/CHANGELOG.md`), classifies ship-line vs decision-line, composes a dated line in changelog voice, and **shows it for accept / edit / reject before writing**. One line per shipped unit, not per commit. Never auto-fires, never auto-writes.

See `~/.claude/skills/update-changelog/SKILL.md` for the full procedure.
