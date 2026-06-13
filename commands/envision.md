---
description: Interview the user on a project's top-level vision — intent, UX shape, module partition, boundaries, and relations — and write a versioned vision under .claude/visions/<slug>/. Visions are the load-bearing artefact upstream of /spec; each module the vision names becomes a candidate slug for its own /spec run. One vision per project; versions track evolution.
---

Run the `envision` skill for the current context.

Forms:

- `/envision` — write to the reserved `default` slug (the repo itself is the project).
- `/envision <slug>` — named slug; create `v1.md` if new, else evolve the active version.
- `/envision <slug> --new` — explicit fresh slug; refuse if `<slug>` already exists in INDEX.
- `/envision <slug> --abandon` — mark the active version `abandoned`; no new file written.

The skill runs a breadth-first interview (intent, UX, module partition, boundaries, relations, cross-cutting concerns, non-goals), refuses spec-level detail, grounds via `/discover`, produces a mandatory module-map diagram, and writes the versioned vision under `.claude/visions/<slug>/` plus INDEX.md. Each module it names becomes a candidate slug for `/spec`. It does not spec, plan, or execute.

See `~/.claude/skills/envision/SKILL.md` for the full procedure.
