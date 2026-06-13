---
applyTo: "skills/**,agents/**,architectural-rules/**,hooks/**,commands/**"
---

# config-authoring rules

> Auto-loaded by Copilot when editing files matching `skills/**,agents/**,architectural-rules/**,hooks/**,commands/**`. Generated from `architectural-rules/config-authoring/` — do not hand-edit.

## Cross-tool core — the always-on discipline that travels to every agent

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

**Why:** the discipline corpus is Claude-Code-machinery; Codex/Copilot/local agents can't run the skills or hooks that enforce it. This core is the plain-text floor those agents *can* read. Landmines (the 🚫 block) are sourced from the corpus's `kind: warning` rules + `git.md` (no-AI-attribution) + `share-readiness` (no owner coupling) + the never-commit-secrets convention. The projector flattens this file + the always-tier universal rules into the always-on surface, and projects each language scope into its own `applyTo` file — so breadth stays context-free, exactly as relevance-gating does for Claude.

## Share-readiness — no owner identity or machine assumptions in the harness

This rule governs **authoring the harness itself** (contexture's skills / agents / rules / hooks / settings templates), not a user's project code. A user's own application code *should* contain their paths and identity; flagging that would be wrong. The line: rules under `config-authoring/` fire only when building the config, never on the code the config is used to write.

contexture is a **shareable artefact**: a peer clones it, runs bootstrap, and customizes via config without editing shipped files. For that to hold, no shipped artefact may assume the owner's identity or machine. Three leak categories, all forbidden as literals in a shipped artefact:
**Paths** — a home directory, drive letter, vault root, username-bearing path, or absolute project location (`C:\Users\<name>\...`, `/Users/<name>/...`, `D:\Personal\...`). Read from config at runtime. (This is the [[no-hardcoded-machine-paths]] rule; share-readiness restates it as one of three categories.)
**Identity** — the owner's name, username, or email baked into a skill body, frontmatter template, or default value (a `reviewer:` field, an `author:` literal). Resolve from `git config`, from harness config, or leave a clearly-marked placeholder the skill fills at runtime.
**Tool assumptions** — hardcoding that a specific tool is installed at a specific path (a `bun` runtime, a personal CLI at `D:/Personal/...`, a named MCP) without a documented prerequisite and a graceful-degrade path. A friend who lacks the tool must get a clear message, never a crash or a silent wrong result.
When a config value is absent, **surface a "configure this" message** naming the exact key to set — never silently guess, never write to a fabricated location, never substitute the owner's value as a default. (Mirrors the allowlist-surfacing and [[config-is-truth]] patterns.)

**Why:** the config was a single-user artefact; sharing it (peer fork + customize) makes owner-coupling a portability defect, not a cosmetic one. A leak is correct on exactly one machine for exactly one person — every other clone gets a crash, a misattribution, or a write to the wrong place. The discipline was reactive (a vault-path leak shipped, broke a second machine, was fixed once); engraving it makes prep surface it while authoring and review audit it after, so the next leak is caught before a friend hits it.

**Smell:** grepping `skills/`, `agents/`, `architectural-rules/`, `commands/`, or settings templates for a username, a drive letter, an email, or a personal tool path returns hits. Each un-annotated hit is a share-readiness defect. The `bootstrap --verify` leak check automates this grep.
