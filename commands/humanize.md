---
description: Detect, score, and rewrite AI-generated texture in user-facing prose (tech docs / email & messaging / PR-proposal-issue). Density-not-instance, advisory likelihood not a verdict, voice-calibrated rewrite. Refuses the terse model corpus.
---

Run the `humanize` skill for the current context.

Any text or file path after `/humanize` is treated as the draft to humanize. Examples:

- `/humanize` — humanize the draft in the recent conversation / current selection; detect the register, ask if ambiguous.
- `/humanize README.md` — humanize that file (tech-doc register).
- `/humanize <pasted email>` — detect email register, flag template scaffolding, rewrite to a real human voice.

The skill auto-detects the register (tech-doc / email / project-internal), checks the length gate, flags AI-texture **by aggregate density** with exact quotes (never single instances), scores on four evidence-based dimensions, and — given a writing sample for this run — returns a voice-calibrated rewrite that preserves every argument. It reports advisory likelihood, **never** a binary AI/human verdict, and **refuses** the terse model corpus (memory, codemap, specs). Mode A only — never auto-fires.

See `~/.claude/skills/humanize/SKILL.md` for the full procedure.
