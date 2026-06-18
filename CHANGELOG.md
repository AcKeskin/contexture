# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-06-18 — Codemap: AST extraction for ~12 languages (TS/JS/C# + C/Ruby/PHP) and a syntactic call graph ranked project-internal first; codemap-visualize renders it. New trace_path graph-query tool in the project-memory MCP for transitive who-calls / impact analysis. Tier-1 instructions: canonical tool commands, subagent state-harvest channel, bootstrap orphaned-link advisory + prune-on-rename.

_4 added, 15 changed, 1 removed._

### Architectural rules
- added `architectural-rules/universal/canonical-commands.md`

### Bootstrap
- changed `bootstrap/lib/verify.js`

### CLAUDE.md imports
- changed `claude-md/_imports.md`

### Docs
- changed `docs/architectural-rules.md`

### Hooks
- changed `hooks/agent-output-contract-validator.js`

### MCP servers
- added `mcps/project-memory/src/retrieval/graph.ts`
- added `mcps/project-memory/src/tools/trace.ts`
- added `mcps/project-memory/test/graph.test.ts`
- changed `mcps/project-memory/src/index.ts`

### Other
- changed `AGENTS.md`
- removed `CHANGELOG.md`

### Skills
- changed `skills/capture/SKILL.md`
- changed `skills/codemap-visualize/codemap-visualize.mjs`
- changed `skills/dispatch/SKILL.md`
- changed `skills/pr-respond/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/update-codemap/test/baseline.json`
- changed `skills/update-codemap/test/fixtures.mjs`
- changed `skills/update-codemap/test/language-sweep.mjs`
- changed `skills/update-codemap/treesitter.mjs`
