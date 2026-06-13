---
description: Project an LLM-optimized planning artefact (plan / blueprint / spec / vision) into a human-readable approval view — the goal + the concrete decisions in plain prose, with an alignment check, so you can approve it and confirm the discussions were pointing at the right thing.
---

Run the `human-view` skill.

Forms:

- `/human-view <slug>` — render the human view of the slug's active artefact (prefers plan → blueprint → spec → vision; asks if ambiguous).
- `/human-view <path>` — render the human view of a specific artefact file.
- `/human-view <slug|path> --vault` — also write a human copy to the Obsidian vault.

Every planning artefact is written token-optimized **for the LLM**. This renders the opposite: a plain-prose view of **what's actually in the LLM's head** — the goal in one breath, what was decided (and why it matters), an **alignment check** (where it narrowed/expanded/reinterpreted your ask), and the open questions — so you can approve it and catch a misalignment *before* it ships into `/execute`.

It is a faithful **projection** (never modifies the source, never invents or softens), library-callable by the `/draft-plan` and `/blueprint` review gates, and never auto-fires. The LLM artefact stays the source of truth.

See `~/.claude/skills/human-view/SKILL.md` for the full procedure.
