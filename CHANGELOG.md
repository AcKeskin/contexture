# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-06-28 — Codemap: build-output denoise + honest folder summaries; sequence diagrams + richer module map; TypeScript/C# call-edge type resolution. Plus the session scope-boundary guard.

_15 added, 78 changed, 1 removed._

### Architectural rules
- added `architectural-rules/universal/autonomy-default.md`
- added `architectural-rules/universal/session-scope-boundary.md`
- changed `architectural-rules/README.md`
- changed `architectural-rules/universal/naming-and-comments.md`

### Bootstrap
- changed `bootstrap/bootstrap.js`
- changed `bootstrap/lib/enablement.js`
- changed `bootstrap/lib/link.js`
- changed `bootstrap/lib/mcps.js`
- changed `bootstrap/lib/settings.js`
- changed `bootstrap/lib/verify.js`

### CLAUDE.md imports
- changed `claude-md/_imports.md`

### Commands
- added `commands/close-out.md`
- added `commands/glossary.md`
- added `commands/update-changelog.md`
- added `commands/work-state.md`

### Docs
- added `docs/changelog-contract.md`
- added `docs/scope-resolution-resolver.md`
- changed `docs/architectural-rules-overlay.md`
- changed `docs/architectural-rules.md`
- changed `docs/bootstrap.md`
- changed `docs/brainstorm-organ.md`
- changed `docs/capture-organ.md`
- changed `docs/checkpoint-organ.md`
- changed `docs/coordinate-organ.md`
- changed `docs/delivery-organ.md`
- changed `docs/discover.md`
- changed `docs/human-view-organ.md`
- changed `docs/mcp-memory.md`
- changed `docs/plan-execute-workflow.md`
- changed `docs/prep-organ.md`
- changed `docs/recap-organ.md`
- changed `docs/reference.md`
- changed `docs/review-organ.md`
- changed `docs/review-output-contract.md`
- changed `docs/scope-resolution-manifests.md`
- changed `docs/security-hooks.md`
- changed `docs/statusline.md`
- changed `docs/storage-tagging.md`
- changed `docs/update-codemap.md`

### Hooks
- added `hooks/lib/glob-files.js`
- added `hooks/lib/glob-files.test.js`
- changed `hooks/agent-output-contract-validator.js`
- changed `hooks/clear-context-decision-guard.js`
- changed `hooks/lib/resolve-rules.js`
- changed `hooks/rule-prime.js`

### MCP servers
- changed `mcps/project-memory/src/retrieval/codemap.ts`
- changed `mcps/project-memory/src/retrieval/render.ts`
- changed `mcps/project-memory/src/retrieval/score.ts`
- changed `mcps/project-memory/src/tools/discover.ts`

### Other
- changed `AGENTS.md`
- changed `README.md`
- removed `CHANGELOG.md`

### Skills
- added `skills/autonomize/SKILL.md`
- added `skills/close-out/SKILL.md`
- added `skills/glossary/SKILL.md`
- added `skills/update-changelog/SKILL.md`
- added `skills/work-state/SKILL.md`
- changed `skills/blueprint/SKILL.md`
- changed `skills/capture/SKILL.md`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/codemap-visualize/SKILL.md`
- changed `skills/codemap-visualize/codemap-visualize.mjs`
- changed `skills/coordinate/SKILL.md`
- changed `skills/deliver/SKILL.md`
- changed `skills/discover/SKILL.md`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/extract-conventions/SKILL.md`
- changed `skills/extract-conventions/detect.mjs`
- changed `skills/memory-audit/SKILL.md`
- changed `skills/new-agent/SKILL.md`
- changed `skills/new-agents-md/SKILL.md`
- changed `skills/new-hook/SKILL.md`
- changed `skills/new-hook/recipes/rule-prime/template.js`
- changed `skills/new-mcp/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pr-author/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/prep/SKILL.md`
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/recap/SKILL.md`
- changed `skills/retrospect-core/SKILL.md`
- changed `skills/retrospect/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/spec/SKILL.md`
- changed `skills/system-review/SKILL.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/update-codemap/test/fixtures.mjs`
- changed `skills/update-codemap/test/language-sweep.mjs`
- changed `skills/update-codemap/treesitter.mjs`
- changed `skills/write-tests/SKILL.md`
