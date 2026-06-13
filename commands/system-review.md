---
description: Step back over the organ system itself — skills / agents / commands / hooks / rules — and surface where it no longer coheres. Responsibility overlap, dead/unused config, pipeline gaps & redundancy, drift from the vision. Routes consolidation/drop candidates to proposal stubs. System counterpart to /retrospect.
---

Run the `system-review` skill.

Forms:

- `/system-review` — full coherence audit of the whole organ surface.
- `/system-review <area>` — narrow to one surface: `skills`, `agents`, `hooks`, `rules`.

Examples:

- `/system-review` — "is the harness still coherent — anything overlapping, dead, missing, or drifted from the vision?"
- `/system-review skills` — overlap + dead + gaps among the skills and their command shims only.

The skill runs four passes over the contexture harness surface: **responsibility overlap** (organs whose jobs have started to blur, with no stated boundary), **dead/unused config** (commands without a skill, user-facing skills without a command, orphaned hooks, cold agents/rule-scopes — all *candidates*, since there's no runtime usage log), **pipeline gaps & redundancy** (a stage nothing fills, or the same mechanism duplicated across organs that should share it), and **coherence vs vision** (organ clusters with no vision/proposal lineage, vision modules with no organ serving them).

It is the system counterpart to `/retrospect`: retrospect audits the *decision history*, system-review audits the *system that history produced*. Both share the `retrospect-core` engine. Substantive organ changes — merges, splits, retirements — **route to proposal stubs** (the normal design pipeline); only orphan-shim removals and one-paragraph boundary notes are fixed directly. Each finding is propose-confirm-commit. Repeat runs tag NEW / CARRIED / RESOLVED against `.claude/system-reviews/<area>/latest.md`.

v1 is config-repo-scoped (the harness is "the system"); the name generalizes to any codebase's architecture later. Does not auto-fire. Not code review (that's `/review` on the config repo's own code) — this reviews the *shape* of the organ system, not implementation correctness.

See `~/.claude/skills/system-review/SKILL.md` for the full procedure.
