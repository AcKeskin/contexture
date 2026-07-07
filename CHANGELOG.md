# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-07-07 — Config shaping pass — refined skills, rules, hooks, publish-boundary and bootstrap across the harness (Fable-assisted)

_27 added, 126 changed, 1 removed._

### Agents
- changed `agents/c-sharp-pro.md`
- changed `agents/unity-pro.md`

### Architectural rules
- added `architectural-rules/universal/focused-execution.md`
- added `architectural-rules/universal/git-workflow.md`
- changed `architectural-rules/README.md`
- changed `architectural-rules/rust/interoperability.md`
- changed `architectural-rules/universal/autonomy-default.md`
- changed `architectural-rules/universal/git.md`
- changed `architectural-rules/universal/naming-and-comments.md`
- changed `architectural-rules/universal/session-scope-boundary.md`

### Bootstrap
- added `bootstrap/lib/compare.js`
- added `bootstrap/lib/copy-manifest.js`
- added `bootstrap/test-copy-idempotency.js`
- changed `bootstrap/bootstrap.js`
- changed `bootstrap/lib/link.js`
- changed `bootstrap/lib/verify.js`

### CLAUDE.md imports
- changed `claude-md/_imports.md`

### Commands
- added `commands/autonomize.md`
- added `commands/status.md`
- changed `commands/blueprint.md`
- changed `commands/checkpoint.md`
- changed `commands/extract-conventions.md`
- changed `commands/glossary.md`
- changed `commands/memory-audit.md`
- changed `commands/new-agents-md.md`
- changed `commands/new-hook.md`
- changed `commands/orchestrate.md`
- changed `commands/recap.md`
- changed `commands/retrospect.md`
- changed `commands/system-review.md`
- changed `commands/update-changelog.md`
- changed `commands/wrap.md`
- changed `commands/write-tests.md`

### Cross-tool instructions
- changed `.github/instructions/universal.instructions.md`

### Docs
- changed `docs/architectural-rules-overlay.md`
- changed `docs/architectural-rules.md`
- changed `docs/blueprint-organ.md`
- changed `docs/bootstrap.md`
- changed `docs/capture-organ.md`
- changed `docs/changelog-contract.md`
- changed `docs/checkpoint-organ.md`
- changed `docs/delivery-organ.md`
- changed `docs/discover.md`
- changed `docs/human-view-organ.md`
- changed `docs/mcp-memory.md`
- changed `docs/plan-execute-workflow.md`
- changed `docs/prep-organ.md`
- changed `docs/project-architecture.md`
- changed `docs/recap-organ.md`
- changed `docs/reference.md`
- changed `docs/review-organ.md`
- changed `docs/review-output-contract.md`
- changed `docs/scope-resolution-manifests.md`
- changed `docs/scope-resolution-resolver.md`
- changed `docs/security-hooks.md`
- changed `docs/statusline.md`
- changed `docs/storage-tagging.md`
- changed `docs/update-codemap.md`

### Hooks
- added `hooks/rm-rf-blocker.test.js`
- added `hooks/tests/bootstrap-drift-injector.test.js`
- added `hooks/tests/clear-context-decision-guard.test.js`
- added `hooks/tests/coordinate-autoregister.test.js`
- added `hooks/tests/fixtures/clear-context-decision-guard.silent.json`
- added `hooks/tests/fixtures/clear-context-decision-guard.trigger.json`
- added `hooks/tests/fixtures/session-start.startup.json`
- added `hooks/tests/fixtures/transcript.decision-recapped.jsonl`
- added `hooks/tests/fixtures/transcript.decision-unpersisted.jsonl`
- added `hooks/tests/fixtures/transcript.ship-closed.jsonl`
- added `hooks/tests/fixtures/transcript.ship-unclosed.jsonl`
- added `hooks/tests/fixtures/wrap-terminus-recovery.silent.json`
- added `hooks/tests/fixtures/wrap-terminus-recovery.trigger.json`
- added `hooks/tests/harness.js`
- added `hooks/tests/wrap-terminus-recovery.test.js`
- changed `hooks/bootstrap-drift-injector.js`
- changed `hooks/clear-context-decision-guard.js`
- changed `hooks/coordinate-autoregister.js`
- changed `hooks/force-push-main-blocker.js`
- changed `hooks/lib/hook-io.js`
- changed `hooks/rm-rf-blocker.js`
- changed `hooks/rule-prime.js`
- changed `hooks/wrap-terminus-recovery.js`

### MCP servers
- changed `mcps/project-memory/README.md`
- changed `mcps/unity/server/src/index.ts`

### Other
- added `.gitattributes`
- added `scripts/census-shims.js`
- added `scripts/lint-rules.js`
- changed `.gitignore`
- changed `AGENTS.md`
- changed `README.md`
- removed `CHANGELOG.md`

### Settings
- changed `settings/settings.local.json.example`

### Skills
- added `skills/pr-review/vault-iterations.md`
- added `skills/review/feedback-loop.md`
- changed `skills/autonomize/SKILL.md`
- changed `skills/blueprint/SKILL.md`
- changed `skills/blueprint/mermaid-templates.md`
- changed `skills/brainstorm/SKILL.md`
- changed `skills/capture/SKILL.md`
- changed `skills/capture/secret-patterns.md`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/coordinate/SKILL.md`
- changed `skills/deliver/SKILL.md`
- changed `skills/discover/SKILL.md`
- changed `skills/dispatch/SKILL.md`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/extract-conventions/SKILL.md`
- changed `skills/glossary/SKILL.md`
- changed `skills/human-view/SKILL.md`
- changed `skills/humanize/SKILL.md`
- changed `skills/humanize/references/ai-vocabulary.v1.md`
- changed `skills/humanize/references/false-positives.md`
- changed `skills/memory-audit/SKILL.md`
- changed `skills/new-agent/SKILL.md`
- changed `skills/new-agents-md/SKILL.md`
- changed `skills/new-hook/SKILL.md`
- changed `skills/new-hook/lib/runner-template.js`
- changed `skills/new-hook/recipes/context-injector/README.md`
- changed `skills/new-hook/recipes/context-injector/allow.json.template`
- changed `skills/new-hook/recipes/context-injector/block.json.template`
- changed `skills/new-hook/recipes/context-injector/template.js`
- changed `skills/new-hook/recipes/rule-prime/README.md`
- changed `skills/new-hook/recipes/rule-prime/allow.json.template`
- changed `skills/new-hook/recipes/rule-prime/block.json.template`
- changed `skills/new-hook/recipes/rule-prime/template.js`
- changed `skills/new-hook/recipes/session-recovery-advisory/README.md`
- changed `skills/new-hook/recipes/session-recovery-advisory/allow.json.template`
- changed `skills/new-hook/recipes/session-recovery-advisory/block.json.template`
- changed `skills/new-hook/recipes/session-recovery-advisory/template.js`
- changed `skills/new-mcp/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pr-author/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/prep/SKILL.md`
- changed `skills/recap/SKILL.md`
- changed `skills/retrospect-core/SKILL.md`
- changed `skills/retrospect/SKILL.md`
- changed `skills/review/OUT-OF-SCOPE.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/vault-output.md`
- changed `skills/rules/SKILL.md`
- changed `skills/spec/SKILL.md`
- changed `skills/system-review/SKILL.md`
- changed `skills/update-changelog/SKILL.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/using-git-worktrees/SKILL.md`
- changed `skills/visualise-codemap/SKILL.md`
- changed `skills/visualise-codemap/visualise-codemap.mjs`
- changed `skills/work-state/SKILL.md`
- changed `skills/wrap/SKILL.md`
- changed `skills/write-tests/SKILL.md`
