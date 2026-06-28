# AGENTS.md

Vendor-neutral instructions for any coding agent (Codex, Cursor, Copilot, Aider, local models). This is a **derived projection** of the repo's Claude-Code instruction corpus — regenerate it with `node skills/new-agents-md/...` rather than hand-editing; a hand-edit is clobbered on the next regen. (Claude Code reads `~/.claude/CLAUDE.md` + the `architectural-rules/` tree directly and does not need this file.)

This repo ("contexture") is a setup for working with AI agents: a discipline loop (spec → plan → execute → review), an on-demand architectural-rule corpus, safety hooks, a file-based memory store, reusable skills, and several MCP servers. It is built around Claude Code but the instruction layer is meant to port to other agents — which is what this file is for.

## Never do this

- **No AI attribution in commits or PRs** — no `Co-Authored-By`, no "Generated with", no robot emoji. Symptom if it slips: the commit history advertises the tool instead of describing the change.
- **No secrets / credentials / `.env` contents** in committed files or memory. Symptom: a key lands in git history and must be rotated.
- **No machine-specific paths or the owner's identity** hardcoded into shipped artefacts (skills, rules, generated files). Resolve paths relative to the module (`import.meta.url`) or from config. Symptom: the artefact only works on one machine, or leaks a username/drive into the public snapshot.
- **No internal R&D vocabulary in shipped code** — never embed internal design-doc/issue numbers or other private-repo identifiers (a numbered proposal reference, an internal ticket id) in committed code or comments. Describe the *concept* instead. Symptom: the public snapshot carries dangling references to a repo nobody can see.
- **Do not edit the symlinked/cached copies under the agent's home dir** (e.g. `~/.claude/skills/...`) — edit the source in this repo (`skills/`, `architectural-rules/`, …) and re-run bootstrap. Symptom: edits to the cached copy silently revert on the next bootstrap/update.
- **Do not force `.claude/` artefacts into version control** on the owner's behalf (codemap, specs, plans, caches). Whether to track them is the owner's choice.
- **Do not bypass git hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly asked. If a hook fails, fix the cause.

## Commands

Skills are standalone scripts run directly with `node`; MCP servers are TypeScript and build separately.

- **Install / wire up:** `node bootstrap/bootstrap.js` — symlinks the corpus (skills, rules, commands, agents, hooks) and MCP servers into the agent home dir. `--exclude=<list>` skips parts (excludable: `claude-md, architectural-rules, skills, commands, agents, hooks, ccline, mcps`). MCP *source* still has to be built separately (below).
- **Verify install / drift:** `node bootstrap/bootstrap.js --verify` — read-only audit; exits 1 on drift. Also runs an advisory share-readiness leak scan.
- **Codemap (read before exploring a large area):** `node skills/update-codemap/codemap.mjs` writes `.claude/codemap.md`. Diagrams: `node skills/codemap-visualize/codemap-visualize.mjs`.
- **Primary test — the codemap language sweep (regression gate):** `node skills/update-codemap/test/language-sweep.mjs` — runs the real extract→visualize pipeline per language against `test/baseline.json`; exits non-zero on regression. `--update-baseline` re-records.
- **MCP build + test:** in `mcps/<name>/` (the ones with a `package.json`), `npm run build` (`tsc`), then `npm test` where defined (e.g. `mcps/project-memory` runs `tsc -p tsconfig.test.json && node --test`). Some MCPs expose `npm run smoke` instead.
- **Post-edit order:** run the test that covers what you touched (the sweep for codemap changes; the affected MCP's `npm test`/build for MCP changes) before considering the change done.

## Architecture

Top-level layout (see `.claude/codemap.md` for the file-by-file map with purposes and exports):

- `skills/` — reusable agent skills, one folder each; the logic-bearing ones are standalone `.mjs` (e.g. `update-codemap/`, `codemap-visualize/`). The discipline loop lives here.
- `architectural-rules/` — the on-demand rule corpus. `universal/` always applies; `<language>/` (e.g. `csharp/`, `typescript/`, `cpp/`) applies when editing that language; config-authoring scopes apply when editing skills/agents/rules/hooks. Read the ones matching what you touch.
- `mcps/` — MCP servers (TypeScript: `project-memory`, `unity`, `godot`, …). Each is its own buildable package.
- `bootstrap/` — the installer that links the corpus + MCPs into the agent home dir.
- `claude-md/`, `commands/`, `agents/`, `hooks/`, `settings/` — Claude-Code-specific instruction/config surfaces.
- `docs/` — design docs and scope maps.

Path discipline: scripts resolve their own location via `import.meta.url`, never the cwd, because they run from a symlinked copy. Honor that when adding code.

## Conventions

- Professional, production-grade only. Correct architecture beats speed. SOLID, clean layering, clear separation of concerns; composition over inheritance; explicit ownership and responsibilities. No hacks, no "temporary" shortcuts.
- If a design is weak, stop and fix it. If assumptions exist, surface and challenge them. If something is unclear, clarify before building on it.
- Match the existing style of the file and its neighbours. Make surgical edits — do not "improve" adjacent code you weren't asked to touch.
- One concern per commit, with a clear message written in changelog voice (what changed for a reader of the repo, not internal session vocabulary). Branch for feature work; merge with an explicit merge commit (`--no-ff`).
- Every change should be verifiable. A change with no way to tell whether it worked is incomplete.

## Stance

Be objective, direct, and honest — not supportive-by-default, not reflexively contrarian. Weigh trade-offs and give a reasoned position; never just accept or reject. Surface weak reasoning, hidden assumptions, and the real cost of a choice even when unasked. A helper is most useful precisely when it is honest, not agreeable.

## Working discipline

- Run one tool/command at a time and read its actual result before the next. Do not chain actions on an assumed outcome — a wrong assumption compounds across chained steps faster than it surfaces.
- Attempt-vs-ask by ambiguity depth: if the request has one dominant reading, make a good-faith attempt and state the assumption you made; if there are two or more reasonable readings, or you'd be inventing requirements, ask before acting.
- Separate gathering information from changing things. For non-trivial work, plan first and get the plan confirmed before mutating files.
