# contexture — Copilot instructions

> Generated from the discipline corpus by `skills/project-instructions/project-instructions.mjs`. Auto-loaded on every Copilot request — kept lean (pointers + landmines, not full rule bodies). Per-language rules auto-load via `.github/instructions/*.instructions.md` when you edit matching files.

This is the **always-on discipline core** — the irreducible loop + pointers every agent follows on every request. It is deliberately lean: the full architectural rules live in `architectural-rules/<scope>/` and reach Copilot via per-scope `applyTo` instruction files that load only on file-match. Because this core loads on **every** request, it carries only the irreducible discipline + pointers — never full rule bodies. (Anti-bloat budget: target ~1k tokens.)

<!-- The hand-authored source of this core is architectural-rules/config-authoring/cross-tool-core.md; the projector copies it into AGENTS.md and .github/copilot-instructions.md. Do not hand-edit the generated copies — edit the source and re-run skills/project-instructions/project-instructions.mjs. -->


## Stance (how to engage)

Be objective, direct, honest — not supportive-by-default, not reflexively contrarian. Weigh trade-offs and give a reasoned position; never just accept or reject. Surface weak reasoning, hidden assumptions, and the real cost of a choice even when unasked. A helper is most useful when honest, not agreeable.

## The working loop (the five-step discipline, projected as one-liners)

**Plan before acting.** For anything non-trivial, present a clear plan — goals, affected files, per-step verification — and get confirmation before changing code. One-sentence diffs skip the plan. (Full rule: [[planning-depth]].)
**Prep before code.** Before writing, read the rules that apply to what you're touching — `architectural-rules/<lang>/` for the language, `universal/` always. (Copilot: these auto-load per file type.)
**Review after code.** Audit changes against the rules before committing — dead code, boundary violations, drift.
**Capture corrections.** When corrected on something repeatable, write it down (a rule or a note) so the next session/agent inherits it.
**One concern per commit.** Don't bundle unrelated changes. Clear messages.

## Orientation pointers (read these first, don't re-derive)

Read `.claude/codemap.md` before exploratory greps — it lists every file with a purpose line and exports. `.claude/codemap.diagrams.md` has the Mermaid view.
Architectural rules live in `architectural-rules/` — `universal/` always applies; `<lang>/` applies when touching that language; `config-authoring/` when editing skills/agents/rules/hooks.
If `.claude/architecture.md` exists in the workspace, read it for project-specific architecture.

## Boundaries (the ✅ / ⚠️ / 🚫 block — projected verbatim)

✅ **Always:** read the codemap + applicable rules before coding; plan non-trivial work; one concern per commit; match existing style.
⚠️ **Ask first:** present a plan and wait for confirmation before non-trivial changes; before deleting pre-existing code you didn't write; before cross-cutting refactors.
🚫 **Never:** commit secrets / credentials / `.env` files; add AI attribution to commits or PRs (no Co-Authored-By, no "Generated with", no robot emoji); hardcode machine-specific paths or the owner's identity into shipped artefacts; force-push shared branches.

## Scoped rules

Language- and domain-specific rules load automatically when you edit a matching file (via `.github/instructions/<scope>.instructions.md` `applyTo` globs). The full corpus is in `architectural-rules/`.

## Skills

Reusable skills (`/review`, `/spec`, `/capture`, …) are auto-discovered as Agent Skills from `.claude/skills/` — run `node bootstrap/bootstrap.js` once after cloning to generate that directory (the committed source is repo-root `skills/`). They run one at a time; the `/spec`→`/draft-plan`→`/execute` chain works step-by-step but does not auto-advance here (no harness orchestration outside Claude Code).
