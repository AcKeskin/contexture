# new-agents-md: reference

Read when the step you are on points here, or when something fails.

## What this skill does NOT do

- **Does not invert CLAUDE.md into a stub.** `CLAUDE.md` stays canonical for Claude Code; it gains
  a one-line pointer, not an `@AGENTS.md` redirect. The loader is Claude-specific — see Why.
- **Does not live-mirror or hook.** `AGENTS.md` regenerates on demand (re-run the skill), never via
  a watcher. Drift between corpus and projection is a re-run away; surfaced by `/review` or
  `/memory-audit`, never enforced.
- **Does not dump the full corpus.** On-demand language/domain rules beyond detected scope stay
  out. The file stays lean; the soft size budget surfaces overflow for the user to trim.
- **Does not auto-fire.** Mode A only. No SessionStart hook.
- **Does not invent content.** Exact commands and repo landmines come from the user; the corpus
  slice comes from real files. The skill structures and composes — it does not fabricate rules,
  commands, or landmines.
- **Does not hardcode the global path.** Read from config, with a "configure me" fallback.
- **Does not silently truncate.** Heavy projections trigger the advisory size-flag; the user trims.

## Relationship to other organs

- **discover** — Pass 1 reads architectural rules through discover's resolution path so the
  tier overlay is already applied. Do not re-resolve; do not read the raw shipped tree.
- **capture** — Pass-2 landmines route to capture (batched) so they land as durable
  `warning`-kind memories, not only in the projected file. Capture's own confirm flow runs.
- **prep** — when building or editing this skill, prep with `[skills, instructions]` scope.
- **review** — review can flag a stale `AGENTS.md` (older than its source corpus) as drift;
  it does not regenerate.
- **canonical-commands** — producer→consumer seam: canonical-commands pins commands *inside* the
  corpus; this skill projects them *outward*. If the pins exist, the command interview confirms
  from them; if not, it asks cold.
- **org rule tier** — a team-shared org-tier `AGENTS.md` floor layers under the
  repo's. Documented seam; not built here.
- **architectural-rules tree** — `universal/skill-auto-fire.md` (trigger in description) and
  `universal/no-hardcoded-machine-paths.md` (global path from config) both apply directly.
  The fixed **Working discipline** block re-projects the corpus's durable prompting patterns
  into the emitted AGENTS.md so non-Claude agents inherit them.

## Anchors — house style

- `skills/new-agent/SKILL.md` — the structural template this skill clones (frontmatter trigger,
  interview rhythm, soft-rejection forcing functions, "does NOT do", relationship-to-organs).
- `skills/blueprint/SKILL.md` — the closest analog: reads upstream artefacts, composes, writes to
  `.claude/` + vault with a preview gate. Same distill-then-present-then-write shape.
