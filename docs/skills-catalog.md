# Skills catalog

Every skill shipped in `skills/`. 43 skills, grouped by what they do.

**Firing modes** used below:
- **Manual** — user-invoked only (`/name`), never auto-fires.
- **Auto** — fires on a detected trigger without being asked.
- **Library** — not user-invocable; called by other skills.

---

## Scope chain (idea → shipped)

The main pipeline. Each stage writes a versioned artefact the next stage reads.

| Skill | Mode | What it does |
|---|---|---|
| `brainstorm` | Manual | Talks a half-formed idea into a name, one-line description, in/out edges, and end-goal. Converges rather than chats; writes `.claude/ideas/<slug>.md` for `envision` to pick up. |
| `envision` | Manual | Interview-driven top-level project vision — intent, UX shape, module partition, boundaries, non-goals — into a versioned `.claude/visions/<slug>/`. Breadth over depth, mandatory module map. Once per project. |
| `spec` | Manual | Detailed interview (via AskUserQuestion) into a versioned spec at `.claude/specs/<slug>/`. Specs evolve as v1, v2, …; `INDEX.md` tracks the active version. |
| `draft-plan` | Manual | Turns the active spec into a versioned plan at `.claude/plans/<slug>/v<N>.md`. Each step carries goal, files, expected outcome, verification criteria. Plans pin to a specific spec version. Accept/edit/reject before write. |
| `blueprint` | Manual | Optional commit-point view after `draft-plan`: what we wanted vs. the concrete shape we're building (classes, interfaces, dependencies, build order) with Mermaid UML. Also re-blueprints existing code via `--from-code`. |
| `execute` | Manual | Runs the plan step by step with verification gates. Picks a strategy up front (sequential / subtask / multi-agent), advances only on pass, stops on any failure. Re-preps on module-boundary crossings. |
| `close-out` | Manual | Terminus after `execute` meets done-criteria. Reconciles the shipped change back into the canonical spec, retires spent plan/blueprint artefacts to a dated archive, records one ship line. |
| `work-state` | Manual | Read-only position report for a slug in the chain — per-stage missing/present/stale/done table, one next-action line, and the stale-spec-pin check. Mostly filesystem-derived. Aliased as `/status`. |
| `human-view` | Manual + callable | Projects an LLM-optimized planning artefact (plan, blueprint, spec, vision) into plain human-readable prose so you can actually approve it. Called by the `draft-plan` / `blueprint` review gates. |

## Context priming and memory

| Skill | Mode | What it does |
|---|---|---|
| `prep` | **Auto** | Primes the session with architectural rules relevant to the task — universal + language + domain + project tiers. The rule-prime hook owns the mechanical floor at session start; `prep` runs the deep pass on top. Fires on first substantive task, after `/clear`, and on topic shifts. |
| `discover` | Manual + callable | Loads relevant stored memories and codemap entries for the current task. Also called by `prep` and `review`. |
| `capture` | Mostly manual | Captures a memory (lesson / decision / rule / preference / feedback / project fact / reference) via propose-confirm-commit. Auto-*proposes* only on high-stakes signals (reversal of a shipped decision, a correction phrased with finality, a "X broke Z" warning). Never silent-writes. |
| `memory-audit` | Manual | Audits the memory tree across ten dimensions for integrity drift and bloat — orphans, duplicates, broken relations, stale references, schema gaps, uncompressed bodies. Read-only by default. |
| `deliver` | **Library** | Renders retrieved fragments into working context per the deliver format contract. Stateless; called by `discover`, `prep`, `review`. |
| `recap` | Manual | Writes an episodic session record — what the session was about, investigated, learned, completed, and what's next. Triggers a promotion pass where Learned items can become rule-tier memories. |

## Code quality and review

| Skill | Mode | What it does |
|---|---|---|
| `review` | Manual | Audits code in scope against your architectural rules and reports drift — dead code, SoC violations, monoliths, missing patterns, comment drift, naming quality. Propose-confirm per fix; routes rule misses to `capture`. Not a linter, not a security audit. |
| `checkpoint` | Manual | Scope-dialed fit-and-intent audit: "does this serve the original point, cohere with the whole, and what did I learn?" Auto-detects zoom (diff / module / corpus), overridable with `--scope`. At diff scope composes code-review plus a fit pass. |
| `write-tests` | Manual | Authors a test suite for *existing* code. Detects framework + conventions, proposes a confirmable test plan first, delegates idiomatic authoring to the scope's language-pro agent. Characterization-with-flags: pins current behavior but flags suspicious-as-bug rather than enshrining it. |
| `test-driven-development` | Manual | The TDD discipline for non-trivial features/bugfixes where regressions matter. Skipped for prototypes, generated code, config-only changes, one-liners — but only with permission. |
| `systematic-debugging` | Manual | Root-cause-first discipline for any bug or test failure without an obvious one-line fix. Blocks the "try random fixes" failure mode. |

## Pull requests and git

| Skill | Mode | What it does |
|---|---|---|
| `pre-push` | **Auto** | Pre-flight checklist before `git push`: commits-to-ship summary plus branch-name, commit-hygiene, AI-attribution, staged-leftover, debug-artifact, hook-bypass, and unresolved-secret checks. Stops on any flag, never pushes past it. |
| `pr-author` | **Auto** | Drafts a PR title and body (Summary + Test plan + Closes-line, layered on any existing template) when about to open a PR. Hands you a ready-to-run `gh pr create` — never runs the write itself. |
| `pr-review` | Manual | Reviews an incoming external GitHub PR — fetches the diff via `gh`, analyzes correctness / design / hygiene / security, presents structured findings. No GitHub posting. |
| `pr-triage` | Manual | Walks a PR's unresolved review comments to one of three outcomes: Act (route the fix to `dispatch`/`orchestrate`), Skip/defer, or Note (capture your decision for the reply *you* write). Never drafts or posts replies. |
| `using-git-worktrees` | Manual | Creates an isolated git worktree for feature work that shouldn't pollute the current tree, with directory-selection priority and gitignore safety verification. |

## Parallelism and multi-session

| Skill | Mode | What it does |
|---|---|---|
| `dispatch` | Manual | Fans 2+ genuinely independent tasks (different test files, subsystems, bugs) out to parallel agents. Requires no shared state and no sequential dependency. |
| `orchestrate` | Manual | Goal-directed orchestration: decomposes one goal into units, places each (shared tree / worktree / serialize), fans out via `dispatch`, keeps them on track, then verifies and converges into one result. |
| `coordinate` | Manual | Keeps multiple live Claude sessions aligned via a shared file-based board (`.claude/sessions-active.md`, gitignored) — register ownership, see what others own, leave hand-off notes, detect file/slug collisions. No daemon or polling. |
| `autonomize` | Manual | Owns the single autonomy contract — how hard to push, when to stop, when to ask — that `execute`, `checkpoint`, `orchestrate`, and the rule-prime hook read at their decision points. Settable as a persistent default, per-task, mid-flight, or by a short interview. |

## Project knowledge extraction

| Skill | Mode | What it does |
|---|---|---|
| `update-codemap` | Manual | Regenerates `.claude/codemap.md` — an LLM-facing architecture document with prose overview, per-module roles, detected conventions, hub files, and structured file/class graphs. |
| `visualise-codemap` | Manual | Renders the existing codemap into a UML-heavy document: module structure tree, topologically layered module map with hub/cycle highlighting, per-module class diagrams, cross-module class relations, call graphs, and Mermaid sequence diagrams. Does not rescan the tree. |
| `extract-conventions` | Manual | Observes a scope's dominant conventions and writes a project-tier `conventions.md` rule. Hybrid detection: mechanical conventions (case style, prefixes, import ordering) deterministically, semantic ones by model judgment flagged lower-confidence. Per-category confirm gate; conflicts with universal rules surfaced, never silently overridden. |
| `glossary` | Manual | Extracts the project's ubiquitous language — domain term → definition → code symbol(s) → collision note — into `.claude/rules/glossary.md`, which the rule-prime hook primes and the naming audit cites for vocabulary drift. |
| `rules` | Manual | Manages the architectural-rule overlay: list / disable / enable / edit / sync / where, across the shipped, company, user, and project tiers. Answers "why is this rule applying". |

## Scaffolding

| Skill | Mode | What it does |
|---|---|---|
| `new-agent` | Manual | Scaffolds a Claude Code subagent under `agents/`. Interview forces job-to-be-done, pre-flight questions, anti-patterns, and a debugging workflow rather than a generic persona. |
| `new-hook` | Manual | Scaffolds a hook end-to-end — pick a recipe, name it, fill parameters. Writes the hook file, payload fixtures, a Node-based runner, and merges registration into `settings.json` with diff preview. |
| `new-mcp` | Manual | Scaffolds an MCP server project under `mcps/`. TypeScript or Python, simple tool servers or API wrappers. Writes files, installs deps, builds, registers the server. |
| `new-agents-md` | Manual | Generates a vendor-neutral `AGENTS.md` by projecting this Claude-Code corpus (CLAUDE.md tree, rules, landmines, commands) into a flat file other agents (Codex, Cursor, Aider) can read, interviewing only for gaps the corpus can't know. |

## Writing and prose

| Skill | Mode | What it does |
|---|---|---|
| `humanize` | Manual | Detects, scores, and rewrites AI texture in *user-facing* prose (docs, professional email, PR/proposal/issue). Flags by aggregate density, never single instances; scores four dimensions; produces a voice-calibrated rewrite preserving every argument. Advisory likelihood, never a binary verdict. Refuses the terse model corpus (memory, codemap, specs). |
| `improve-prompt` | Manual | Improves any prompt — LLM/chat/agent or generative image/video/audio. Model-agnostic techniques; interviews to fill real gaps, returns a rewritten prompt plus rationale. |

## Session bookkeeping

| Skill | Mode | What it does |
|---|---|---|
| `wrap` | Manual | Session-terminus driver. One invocation runs the whole closing ceremony in order — coordinate teardown → checkpoint if warranted → recap → close-out → changelog → backlog sweep → progress record — by driving the existing organs rather than reimplementing them. Every canonical write passes accept/edit/reject. |
| `update-changelog` | Manual + callable | Appends one dated line per shipped unit to the canonical `CHANGELOG.md`. Offered by `recap`, `checkpoint`, `execute`, `spec`, `draft-plan`. One line per shipped unit, not per commit. |

## Library-only

Not user-invocable; no slash command exists.

| Skill | What it does |
|---|---|
| `deliver` | Fragment rendering per the deliver format contract (also listed above). |
| `retrospect-core` | Shared engine for checkpoint's meta-review passes — orientation, NEW/CARRIED/RESOLVED baseline diffing, propose-confirm routing, report rendering. |
| `project-instructions/` | **Not a skill** — the deterministic cross-tool projector script (no SKILL.md); invoked by bootstrap, never by trigger. |

---

## Auto-firing summary

Only three skills fire without being asked:

- `prep` — first substantive task, after `/clear`, on topic shift
- `pre-push` — about to `git push`
- `pr-author` — about to `gh pr create`, or first push to a non-default branch with no open PR

`capture` auto-*proposes* on high-stakes signals but still gates on accept/edit/reject. Everything else is manual.
