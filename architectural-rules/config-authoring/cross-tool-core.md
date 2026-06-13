---
name: Cross-tool core — the always-on discipline that travels to every agent
description: The irreducible working core projected into AGENTS.md + Copilot instructions so non-Claude agents (Codex, Copilot, local) follow the same discipline. Source for the cross-tool projector. Kept lean by design — pointers, not full rule bodies.
type: user
kind: architectural-rule
scope: [config-authoring, cross-tool]
relevance: when-touching-cross-tool, when-touching-skills
---

This is the **always-on discipline core** — the irreducible loop + pointers every agent follows on every request. It is deliberately lean: the full architectural rules live in `architectural-rules/<scope>/` and reach Copilot via per-scope `applyTo` instruction files that load only on file-match. Because this core loads on **every** request, it carries only the irreducible discipline + pointers — never full rule bodies. (Anti-bloat budget: target ~1k tokens.)

<!-- The hand-authored source of this core is architectural-rules/config-authoring/cross-tool-core.md; the projector copies it into AGENTS.md and .github/copilot-instructions.md. Do not hand-edit the generated copies — edit the source and re-run skills/project-instructions/project-instructions.mjs. -->


## Stance (how to engage)

<!-- id: stance-honest --> Be objective, direct, honest — not supportive-by-default, not reflexively contrarian. Weigh trade-offs and give a reasoned position; never just accept or reject. Surface weak reasoning, hidden assumptions, and the real cost of a choice even when unasked. A helper is most useful when honest, not agreeable.

## The working loop (the five-step discipline, projected as one-liners)

<!-- id: loop-plan --> **Plan before acting.** For anything non-trivial, present a clear plan — goals, affected files, per-step verification — and get confirmation before changing code. One-sentence diffs skip the plan. (Full rule: [[planning-depth]].)
<!-- id: loop-prep --> **Prep before code.** Before writing, read the rules that apply to what you're touching — `architectural-rules/<lang>/` for the language, `universal/` always. (Copilot: these auto-load per file type.)
<!-- id: loop-review --> **Review after code.** Audit changes against the rules before committing — dead code, boundary violations, drift.
<!-- id: loop-capture --> **Capture corrections.** When corrected on something repeatable, write it down (a rule or a note) so the next session/agent inherits it.
<!-- id: loop-commit --> **One concern per commit.** Don't bundle unrelated changes. Clear messages.

## Orientation pointers (read these first, don't re-derive)

<!-- id: ptr-codemap --> Read `.claude/codemap.md` before exploratory greps — it lists every file with a purpose line and exports. `.claude/codemap.diagrams.md` has the Mermaid view.
<!-- id: ptr-rules --> Architectural rules live in `architectural-rules/` — `universal/` always applies; `<lang>/` applies when touching that language; `config-authoring/` when editing skills/agents/rules/hooks.
<!-- id: ptr-architecture --> If `.claude/architecture.md` exists in the workspace, read it for project-specific architecture.

## Boundaries (the ✅ / ⚠️ / 🚫 block — projected verbatim)

<!-- id: bnd-always --> ✅ **Always:** read the codemap + applicable rules before coding; plan non-trivial work; one concern per commit; match existing style.
<!-- id: bnd-ask --> ⚠️ **Ask first:** present a plan and wait for confirmation before non-trivial changes; before deleting pre-existing code you didn't write; before cross-cutting refactors.
<!-- id: bnd-never --> 🚫 **Never:** commit secrets / credentials / `.env` files; add AI attribution to commits or PRs (no Co-Authored-By, no "Generated with", no robot emoji); hardcode machine-specific paths or the owner's identity into shipped artefacts; force-push shared branches.

**Why:** the discipline corpus is Claude-Code-machinery; Codex/Copilot/local agents can't run the skills or hooks that enforce it. This core is the plain-text floor those agents *can* read. Landmines (the 🚫 block) are sourced from the corpus's `kind: warning` rules + `git.md` (no-AI-attribution) + `share-readiness` (no owner coupling) + the never-commit-secrets convention. The projector flattens this file + the always-tier universal rules into the always-on surface, and projects each language scope into its own `applyTo` file — so breadth stays context-free, exactly as relevance-gating does for Claude.
