---
description: Author a concrete blueprint for a slug — what we wanted (intent) + what we're building now (classes, interfaces, dependencies, module relationships, build order) with Mermaid UML. Optional, after /draft-plan. Presents the draft for accept/edit/reject, then writes to.claude/docs/<slug>/v<N>.md and the Obsidian vault.
---

Run the `blueprint` skill.

Forms:

- `/blueprint <slug>` — **Mode 1 (intent-driven).** Author from `.claude/visions/<slug>/`, `.claude/specs/<slug>/v<M>.md` (active), and `.claude/plans/<slug>/v<N>.md` (active, optional). The "after planning, before coding" path.
- `/blueprint <slug> --from-code` — **Mode 2 (from code).** Author from the codebase + `.claude/codemap.md` for a system that was never specced. Inferred runtime flows are labelled "inferred — verify".
- `/blueprint` (no slug) — resolve the slug like `/draft-plan`: `default` if active, else the single active slug, else list and ask. Auto-selects Mode 2 if the resolved slug has no vision/spec.

A blueprint shows **what we wanted** (intent from vision + spec) and **what we're building now** (the mature concrete shape: classes, interfaces, dependencies, module relationships, build order) — the commit-point view, not a process narrative. Output is presented for **accept / edit / reject** before anything is written (review gate). On accept, writes `.claude/docs/<slug>/v<N>.md` (versioned, spec-pinned) and an Obsidian vault artefact under `Projects/<ProjectFolder>/Docs/`.

Mermaid only. Manual and optional — `/draft-plan` offers it at its close but never fires it automatically. Does **not** merge with `/draft-plan` (the plan stays the stepped how; the blueprint is the concrete what).

See `~/.claude/skills/blueprint/SKILL.md` for the full procedure (both modes, the three-part structure, the output contract) and `~/.claude/skills/blueprint/mermaid-templates.md` for the diagram templates.
