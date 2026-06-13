---
description: Interview the user in detail using AskUserQuestion, write a versioned spec under .claude/specs/<slug>/. Specs evolve via versioned files (v1, v2, …); INDEX.md tracks the active version per slug. Use for non-trivial features where requirements need to be surfaced before building.
---

Run the `spec` skill for the current context.

Forms:

- `/spec` — write to the reserved `default` slug (project itself is the scope).
- `/spec <slug>` — named slug; create `v1.md` if new, else evolve the active version.
- `/spec <slug> --new` — explicit fresh slug; refuse if `<slug>` already exists in INDEX.
- `/spec <slug> --abandon` — mark the active version `abandoned`; no new file written.

The skill interviews the user, runs a done-criteria probe, grounds the spec via `/discover`, writes the versioned file under `.claude/specs/<slug>/`, and reconciles INDEX.md. It does not implement, plan, or execute.

See `~/.claude/skills/spec/SKILL.md` for the full procedure.
