---
description: Report a slug's position in the scope chain (envision→spec→draft-plan→blueprint→execute→archive) as deterministic structured state — per-stage missing/present/stale/done + next-action + the stale-spec-pin check. Read-only.
---

Run the `work-state` skill for the given slug. `/status <slug>` is an alias.

The text after `/work-state` is the slug to inspect. Examples:

- `/work-state auth-rework` — report where `auth-rework` stands: a per-stage table (vision/spec/plan/blueprint/execute/archive) with each stage `missing/present/stale/done`, a single `next:` action line, and any blockers.
- `/work-state` (no slug) — list active slugs and ask which.

The skill is **read-only** and mostly **deterministic** — it walks `.claude/{visions,specs,plans,docs,archive}/<slug>/`, reads the spec's active version from INDEX, compares the plan's `spec:` pin against it (the load-bearing **stale-pin** check), and computes the first ready stage. No model call for the structural state; no writes, ever. Mode A, never auto-fires.

See `~/.claude/skills/work-state/SKILL.md` for the full resolver procedure.
