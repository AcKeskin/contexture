---
description: Step back over the body of shipped work — proposals, decision-tier memory, ship records, recaps — and surface what no longer coheres. Decision integrity, intent-vs-shipped drift, uncaptured lessons, consolidation candidates. Routes fixes to /capture and /memory-audit; never fixes in place. Macro sibling of /recap.
---

Run the `retrospect` skill.

Forms:

- `/retrospect` — full decision & delivery retrospective over the whole corpus (proposals + decision memory + ship records + recaps).
- `/retrospect <slug>` — conformance sub-mode: score vision→spec→plan→shipped for one feature (each spec clause MET / PARTIAL / MISSING / EXTRA).
- `/retrospect --since <ref>` — windowed run, only proposals/decisions/recaps touched since the git ref (ephemeral — no persisted baseline).

Examples:

- `/retrospect` — "of everything we've decided and shipped, what still holds, what's silently superseded, what drifted, what can we retire."
- `/retrospect mcp-primary-retrieval` — "did we build what we specced for the retrieval slug?"
- `/retrospect --since v059-ship` — only what's changed since shipped.

The skill runs four passes over the project's own record: **decision integrity** (each decision → HOLDS / SUPERSEDED-unmarked / CONTRADICTED / STALE, cross-checking the `supersedes` chains against what proposals actually did), **intent-vs-shipped** (proposals flagged shipped that drifted from spec or whose done-criteria weren't all met), **uncaptured lessons** (a sweep of every recap since the last run for `Learned` items never promoted to a rule), and **consolidation candidates** (what can be retired/merged/re-framed — the manual "drop pass" automated).

It is the macro sibling of `/recap`: recap is one session, retrospect is across many ships. recap *feeds* it. It owns *validity* ("is this decision still true?"); `/memory-audit` keeps *mechanical integrity* (orphans, schema, broken links). Findings **route out** — lessons to `/capture`, integrity fixes to `/memory-audit`, system changes to a `proposals/` stub — never fixed silently. Each finding is propose-confirm-commit (apply / skip / edit / view-detail / won't-fix). Repeat runs tag NEW / CARRIED / RESOLVED against the prior report at `.claude/retrospects/decisions/latest.md`.

Does not auto-fire. Not code review (that's `/review`), not a session recap (that's `/recap`), not mechanical memory integrity (that's `/memory-audit`).

See `~/.claude/skills/retrospect/SKILL.md` for the full procedure.
