---
description: Generate a vendor-neutral AGENTS.md by projecting this Claude-Code instruction corpus — CLAUDE.md tree, architectural rules, warning/feedback landmines, canonical commands — into a flat file other coding agents (Codex, Cursor, Aider, …) can read, then interviewing only for the gaps the corpus can't know.
---

Run the `new-agents-md` skill.

Forms:

- `/new-agents-md` — distill the corpus into a draft repo-root `AGENTS.md` (and a global one), then interview for the gaps.

Examples:

- `/new-agents-md` — "make this repo readable by non-Claude agents."
- Natural language: "create an AGENTS.md", "generate cross-tool instructions", "let Codex/Cursor read our conventions."

The entire instruction surface here is Claude-Code-exclusive — `CLAUDE.md`, the `@claude-md/...` imports, the `~/.claude/architectural-rules/` loader, the typed-memory `warning`/`feedback` corpus, and every skill are invisible to any other coding agent. This skill is a **distill-then-interview** organ: **Pass 1** reads the lean corpus (CLAUDE.md tree + always-tier architectural rules after 047 resolution + `warning`/`feedback` landmines + canonical commands) and proposes a draft *before asking anything*; **Pass 2** interviews only for what no corpus read can supply (exact dev/test commands, repo-specific "never X", architecture orientation, infra hints), routing surfaced landmines back through `/capture` so the projection feeds the source.

It rejects the stub-inversion (the Claude loader is Claude-specific) — `AGENTS.md` carries a flattened behaviour-only projection, **derived not twinned** (regenerate on demand; drift is surfaced by review, not enforced). Complementary to the deterministic `project-instructions` projector and seamed to the 029 org tier.

Does not auto-fire. Not a hand-maintained twin of CLAUDE.md, not a Claude-side change (Claude doesn't read AGENTS.md).

See `~/.claude/skills/new-agents-md/SKILL.md` for the full procedure.
