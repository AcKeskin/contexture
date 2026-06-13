---
description: Produce a versioned plan under .claude/plans/<slug>/v<N>.md from the active spec for that slug. Each step has a goal, files, expected outcome, and verification criteria. Plans pin to a specific spec version. The drafted plan is presented for review (accept / edit / reject) before it is written to disk.
---

Run the `draft-plan` skill for the current context.

Forms:

- `/draft-plan` — resolve the slug from the active specs (default, sole active, or ask).
- `/draft-plan <slug>` — plan against `.claude/specs/<slug>/` active version.
- `/draft-plan <slug> --task "<text>"` — degraded mode: no spec, the text is the input.

The skill preps architectural rules, grounds via `/discover`, drafts steps each tracing to the spec's done-criteria, presents the plan for accept/edit/reject (nothing written until accepted), then writes `.claude/plans/<slug>/v<N>.md` pinned to the spec version and reconciles INDEX.md. It does not implement or execute.

See `~/.claude/skills/draft-plan/SKILL.md` for the full procedure.
