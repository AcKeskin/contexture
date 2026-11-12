# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.












## 2026-11-12 — New ui-craft rule tier stops generic AI-looking UI: settle a direction from the feeling first, a craft floor checked on the rendered result, a refuse list and interaction basics, primed by UI files and words; /visual tells grow from 8 to 35.

_6 added, 10 changed, 0 removed._

### Agents
- changed `agents/react-pro.md`
- changed `agents/unity-ui-pro.md`

### Architectural rules
- added `architectural-rules/ui-craft/craft-floor.md`
- added `architectural-rules/ui-craft/direction.md`
- added `architectural-rules/ui-craft/interaction.md`
- added `architectural-rules/ui-craft/refuse-defaults.md`
- changed `architectural-rules/README.md`

### Cross-tool instructions
- added `.github/instructions/ui-craft.instructions.md`

### Docs
- changed `docs/architectural-rules.md`
- changed `docs/reference.md`

### Hooks
- changed `hooks/rule-prime.js`

### Other
- added `cursor/rules/ui-craft.mdc`
- changed `copilot/agents/react-pro.agent.md`
- changed `copilot/agents/unity-ui-pro.agent.md`

### Skills
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/visual/contract-defaults.json`

## 2026-11-10 — /blueprint --sketch designs a feature together one view at a time; /write splits text with a script so the model writes only new options for flagged sentences, and stops on a dropped term.

_4 added, 16 changed, 0 removed._

### Commands
- changed `commands/blueprint.md`

### Docs
- changed `docs/blueprint-organ.md`
- changed `docs/skills-catalog.md`

### Other
- changed `README.md`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/blueprint/sketch-check.mjs`
- added `skills/blueprint/sketch-check.test.mjs`
- added `skills/blueprint/sketch-mode.md`
- added `skills/write/prep.mjs`
- changed `skills/blueprint/SKILL.md`
- changed `skills/blueprint/mermaid-templates.md`
- changed `skills/blueprint/reference.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/spec/SKILL.md`
- changed `skills/work-state/SKILL.md`
- changed `skills/write/SKILL.md`
- changed `skills/write/assets/write-page.html`
- changed `skills/write/drafts-schema.md`
- changed `skills/write/render-page.mjs`
- changed `skills/write/render-page.test.mjs`

## 2026-11-10 — /write drafts or rewrites user-facing text on a page with options per sentence, modes and a terms check, with /humanize folded in; /visual groups findings by cause and adds match mode; /review calibration evals, inline questions and an agent-config lens; tests a change reaches run first; rm-rf-blocker closes eight gaps; lint-skills catches hidden Unicode; migration-safety, api-safety and Godot 4.4+ rules; /execute keeps its step across compaction.

_49 added, 63 changed, 0 removed._

### Architectural rules
- added `architectural-rules/backend/api-safety.md`
- added `architectural-rules/godot/version-breaks.md`
- added `architectural-rules/sql/migration-safety.md`
- changed `architectural-rules/README.md`
- changed `architectural-rules/universal/prose-authenticity.md`

### Bootstrap
- changed `bootstrap/bootstrap.js`

### Commands
- added `commands/write.md`
- changed `commands/humanize.md`

### Cross-tool instructions
- added `.github/instructions/backend.instructions.md`
- changed `.github/instructions/godot.instructions.md`
- changed `.github/instructions/sql.instructions.md`
- changed `.github/instructions/universal.instructions.md`

### Docs
- changed `docs/architectural-rules.md`
- changed `docs/reference.md`
- changed `docs/security-hooks.md`
- changed `docs/skills-catalog.md`

### Hooks
- added `hooks/tests/hook-io.test.js`
- changed `hooks/command-facts.js`
- changed `hooks/compact-snapshot.js`
- changed `hooks/edit-checks.js`
- changed `hooks/lib/hook-io.js`
- changed `hooks/loop-guard.js`
- changed `hooks/prose-lint.js`
- changed `hooks/rm-rf-blocker.js`
- changed `hooks/rm-rf-blocker.test.js`
- changed `hooks/tests/context-hooks.test.js`
- changed `hooks/tests/prose-lint.test.js`

### Other
- added `cursor/rules/backend.mdc`
- added `evals/REVIEW-CALIBRATION.md`
- added `evals/api-checkout-race/case.yaml`
- added `evals/api-checkout-race/graders/atomic-stock.md`
- added `evals/api-checkout-race/graders/one-transaction.md`
- added `evals/api-checkout-race/scaffold.sh`
- added `evals/api-login-limit/case.yaml`
- added `evals/api-login-limit/graders/no-user-enumeration.md`
- added `evals/api-login-limit/graders/rate-limited.md`
- added `evals/api-login-limit/scaffold.sh`
- added `evals/api-order-scope/case.yaml`
- added `evals/api-order-scope/graders/bad-id-4xx.md`
- added `evals/api-order-scope/graders/scoped-to-caller.md`
- added `evals/api-order-scope/scaffold.sh`
- added `evals/review-cal-async-foreach/case.yaml`
- added `evals/review-cal-async-foreach/graders/finds-bug.md`
- added `evals/review-cal-async-foreach/scaffold.sh`
- added `evals/review-cal-clean-paginate/case.yaml`
- added `evals/review-cal-clean-paginate/graders/no-false-alarm.md`
- added `evals/review-cal-clean-paginate/scaffold.sh`
- added `evals/review-cal-clean-slugify/case.yaml`
- added `evals/review-cal-clean-slugify/graders/no-false-alarm.md`
- added `evals/review-cal-clean-slugify/scaffold.sh`
- added `evals/review-cal-null-deref/case.yaml`
- added `evals/review-cal-null-deref/graders/finds-bug.md`
- added `evals/review-cal-null-deref/scaffold.sh`
- added `evals/review-cal-numeric-sort/case.yaml`
- added `evals/review-cal-numeric-sort/graders/finds-bug.md`
- added `evals/review-cal-numeric-sort/scaffold.sh`
- added `evals/review-cal-sql-injection/case.yaml`
- added `evals/review-cal-sql-injection/graders/finds-bug.md`
- added `evals/review-cal-sql-injection/scaffold.sh`
- added `scripts/lint-skills.test.js`
- changed `README.md`
- changed `cursor/rules/godot.mdc`
- changed `cursor/rules/sql.mdc`
- changed `cursor/rules/universal.mdc`
- changed `evals/README.md`
- changed `evals/review-finds-bug/case.yaml`
- changed `scripts/census-shims.js`
- changed `scripts/lint-skills.js`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/update-codemap/affected-tests.mjs`
- added `skills/update-codemap/test/affected-tests.test.mjs`
- added `skills/write/SKILL.md`
- added `skills/write/assets/example-drafts.json`
- added `skills/write/assets/write-page.html`
- added `skills/write/drafts-schema.md`
- added `skills/write/modes.md`
- added `skills/write/references/ai-vocabulary.v3.md`
- added `skills/write/render-page.mjs`
- added `skills/write/render-page.test.mjs`
- changed `skills/design-proposal/SKILL.md`
- changed `skills/design-proposal/references/page-recipe.md`
- changed `skills/execute/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/angles.md`
- changed `skills/review/assets/example-findings.json`
- changed `skills/review/assets/review-page.html`
- changed `skills/review/findings-schema.md`
- changed `skills/review/gate-scan.mjs`
- changed `skills/review/gate-scan.test.mjs`
- changed `skills/review/gates.md`
- changed `skills/review/render-note.mjs`
- changed `skills/review/render-page.mjs`
- changed `skills/review/report.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/update-codemap/treesitter.mjs`
- changed `skills/visual/SKILL.md`
- changed `skills/visual/test/visual.test.mjs`
- changed `skills/visual/visual.mjs`
- changed `skills/write/agents/openai.yaml`
- changed `skills/write/fixtures/density-high.md`
- changed `skills/write/fixtures/density-low.md`
- changed `skills/write/fixtures/negative-model-corpus.md`
- changed `skills/write/fixtures/sample-email.md`
- changed `skills/write/fixtures/sample-project-internal.md`
- changed `skills/write/fixtures/sample-tech-doc.md`
- changed `skills/write/humanize.md`
- changed `skills/write/references/ai-vocabulary.v1.md`
- changed `skills/write/references/ai-vocabulary.v2.md`
- changed `skills/write/references/email.md`
- changed `skills/write/references/false-positives.md`
- changed `skills/write/references/project-internal.md`
- changed `skills/write/references/tech-doc.md`

## 2026-11-05 — A loop guard for turns that keep hitting the same failure; command spellings that work are remembered and offered to capture; an advisory plain-English check on README and docs edits; /review runs the repo's own linters and type checks first; pr-author leads with the problem; pr-triage --watch waits on a PR; a boundary-discipline rule and vacuous-test anti-pattern; a preregistered A/B for <important if> blocks.

_27 added, 20 changed, 0 removed._

### Architectural rules
- added `architectural-rules/universal/boundary-discipline.md`
- changed `architectural-rules/universal/prose-authenticity.md`
- changed `architectural-rules/universal/test-quality.md`

### Bootstrap
- changed `bootstrap/lib/enablement.js`

### Commands
- changed `commands/pr-triage.md`

### Cross-tool instructions
- changed `.github/instructions/config-authoring.instructions.md`
- changed `.github/instructions/universal.instructions.md`

### Docs
- changed `docs/reference.md`

### Hooks
- added `hooks/command-facts.js`
- added `hooks/loop-guard.js`
- added `hooks/prose-lint.js`
- added `hooks/tests/command-facts.test.js`
- added `hooks/tests/loop-guard.test.js`
- added `hooks/tests/prose-lint.test.js`
- changed `hooks/hooks.json`

### Other
- added `evals/PREREG-important-if-2026-11-05.md`
- added `evals/claude-md-bare-migration/case.yaml`
- added `evals/claude-md-bare-migration/graders/has-down.md`
- added `evals/claude-md-bare-migration/graders/named-next-number.md`
- added `evals/claude-md-bare-migration/scaffold.sh`
- added `evals/claude-md-bare-money/case.yaml`
- added `evals/claude-md-bare-money/graders/cents-column.md`
- added `evals/claude-md-bare-money/graders/no-float.md`
- added `evals/claude-md-bare-money/scaffold.sh`
- added `evals/claude-md-if-migration/case.yaml`
- added `evals/claude-md-if-migration/graders/has-down.md`
- added `evals/claude-md-if-migration/graders/named-next-number.md`
- added `evals/claude-md-if-migration/scaffold.sh`
- added `evals/claude-md-if-money/case.yaml`
- added `evals/claude-md-if-money/graders/cents-column.md`
- added `evals/claude-md-if-money/graders/no-float.md`
- added `evals/claude-md-if-money/scaffold.sh`
- changed `.claude-plugin/plugin.json`
- changed `cursor/hooks.json`
- changed `cursor/rules/config-authoring.mdc`
- changed `cursor/rules/universal.mdc`
- changed `evals/README.md`
- changed `scripts/build-plugin.js`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/pr-triage/pr-wait.mjs`
- added `skills/pr-triage/pr-wait.test.mjs`
- added `skills/review/checks.md`
- changed `skills/capture/SKILL.md`
- changed `skills/pr-author/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/report.md`

## 2026-11-04 — Skills fit the compaction budget and $0 args are fixed; a /review gate-integrity scan that skips generated files; tests must fail before the fix; bench preregistration; brainstorm opens with one why question; the codemap refreshes itself, names files better and gives a short layout at session start.

_50 added, 38 changed, 0 removed._

### Architectural rules
- changed `architectural-rules/config-authoring/skill-anatomy.md`
- changed `architectural-rules/universal/test-quality.md`

### Docs
- changed `docs/reference.md`

### Hooks
- changed `hooks/codemap-refresh.js`
- changed `hooks/codemap-search-nudge.js`
- changed `hooks/hooks.json`
- changed `hooks/lib/codemap-state.js`
- changed `hooks/tests/context-hooks.test.js`

### Other
- added `evals/PREREG.md`
- changed `.claude-plugin/plugin.json`
- changed `evals/README.md`
- changed `scripts/build-plugin.js`
- changed `scripts/lint-skills.js`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/blueprint/reference.md`
- added `skills/capture/reference.md`
- added `skills/capture/relations.md`
- added `skills/capture/secret-scan.md`
- added `skills/close-out/reference.md`
- added `skills/coordinate/reference.md`
- added `skills/cycle/reference.md`
- added `skills/cycle/review-mode.md`
- added `skills/cycle/setup.md`
- added `skills/discover/overlay.md`
- added `skills/discover/reference.md`
- added `skills/dispatch/consult.md`
- added `skills/dispatch/harvest.md`
- added `skills/dispatch/reference.md`
- added `skills/draft-plan/cold-read.md`
- added `skills/draft-plan/reference.md`
- added `skills/draft-plan/strict-mode.md`
- added `skills/draft-plan/templates.md`
- added `skills/execute/delegation.md`
- added `skills/execute/done-criteria.md`
- added `skills/execute/reference.md`
- added `skills/extract-conventions/reference.md`
- added `skills/memory-audit/dimensions.md`
- added `skills/memory-audit/reference.md`
- added `skills/new-agent/reference.md`
- added `skills/new-agent/template.md`
- added `skills/new-agents-md/reference.md`
- added `skills/new-agents-md/template.md`
- added `skills/orchestrate/converge.md`
- added `skills/orchestrate/reference.md`
- added `skills/orchestrate/unit-contract.md`
- added `skills/prep/reference.md`
- added `skills/recap/reference.md`
- added `skills/review/gate-scan.mjs`
- added `skills/review/gate-scan.test.mjs`
- added `skills/review/gates.md`
- added `skills/review/outputs.md`
- added `skills/review/persist.md`
- added `skills/review/pr-target.md`
- added `skills/review/pushback.md`
- added `skills/review/reference.md`
- added `skills/review/report.md`
- added `skills/spec/prior-art.md`
- added `skills/spec/reference.md`
- added `skills/spec/templates.md`
- added `skills/update-codemap/reference.md`
- added `skills/update-codemap/spec.md`
- added `skills/visualise-codemap/reference.md`
- added `skills/visualise-codemap/spec.md`
- changed `skills/blueprint/SKILL.md`
- changed `skills/brainstorm/SKILL.md`
- changed `skills/capture/SKILL.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/coordinate/SKILL.md`
- changed `skills/cycle/SKILL.md`
- changed `skills/discover/SKILL.md`
- changed `skills/dispatch/SKILL.md`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/extract-conventions/SKILL.md`
- changed `skills/memory-audit/SKILL.md`
- changed `skills/new-agent/SKILL.md`
- changed `skills/new-agents-md/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/prep/SKILL.md`
- changed `skills/recap/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/angles.md`
- changed `skills/review/reconciliation.md`
- changed `skills/spec/SKILL.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/visualise-codemap/SKILL.md`

## 2026-11-03 — Cold-reader agent and cold read for /spec and /draft-plan; spec open questions that gate the plan; a cycle decision trail with evidence pointers; a subagent rules hook and plan reuse lines to keep code small; an assumption trigger in change-discipline; a public README with a screenshot, install, uninstall and troubleshooting.

_5 added, 35 changed, 0 removed._

### Agents
- added `agents/cold-reader.md`

### Architectural rules
- changed `architectural-rules/universal/change-discipline.md`

### Bootstrap
- changed `bootstrap/lib/enablement.js`

### Cross-tool instructions
- changed `.github/instructions/universal.instructions.md`

### Docs
- added `docs/images/review-page.png`
- added `docs/other-agents.md`
- changed `docs/plan-execute-workflow.md`
- changed `docs/reference.md`
- changed `docs/skills-catalog.md`

### Hooks
- added `hooks/subagent-rules.js`
- changed `hooks/hooks.json`
- changed `hooks/tests/context-hooks.test.js`

### Other
- added `copilot/agents/cold-reader.agent.md`
- changed `.claude-plugin/plugin.json`
- changed `README.md`
- changed `copilot/agents/c-sharp-pro.agent.md`
- changed `copilot/agents/cpp-pro.agent.md`
- changed `copilot/agents/mcp-py-pro.agent.md`
- changed `copilot/agents/mcp-ts-pro.agent.md`
- changed `copilot/agents/metal-video-source-pro.agent.md`
- changed `copilot/agents/react-pro.agent.md`
- changed `copilot/agents/rust-pro.agent.md`
- changed `copilot/agents/unity-pro.agent.md`
- changed `copilot/agents/unity-ui-pro.agent.md`
- changed `copilot/agents/vision-os-pro.agent.md`
- changed `cursor/rules/universal.mdc`
- changed `scripts/build-plugin.js`

### Settings
- changed `settings/settings.template.json`

### Skills
- changed `skills/checkpoint/corpus-passes.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/cycle/SKILL.md`
- changed `skills/cycle/cycle-contract.md`
- changed `skills/cycle/cycle-state.mjs`
- changed `skills/cycle/test/cycle-state.test.mjs`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/envision/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/spec/SKILL.md`
- changed `skills/work-state/SKILL.md`

## 2026-11-01 — Review receipts so a repeat review skips unchanged files, and AI-era questions in the review angles; a skill-triggering eval suite with fixes for skills that didn't fire; a skill-anatomy rule and skills lint; /visual break and report gates for visual and design-proposal; gdscript_check in the Godot MCP; user-only skills stay user-only in Codex.

_43 added, 33 changed, 0 removed._

### Architectural rules
- added `architectural-rules/config-authoring/skill-anatomy.md`

### Bootstrap
- changed `bootstrap/bootstrap.js`

### Cross-tool instructions
- changed `.github/instructions/config-authoring.instructions.md`

### Docs
- changed `docs/skills-catalog.md`

### MCP servers
- added `mcps/godot/godot-plugin/addons/claude_mcp/cli/gdscript_check.gd`
- added `mcps/godot/server/scripts/gdscript-check-parse.mjs`
- added `mcps/godot/server/scripts/gdscript-check-smoke.mjs`
- changed `mcps/godot/README.md`
- changed `mcps/godot/godot-plugin/addons/claude_mcp/tools/registry_smoke_test.gd`
- changed `mcps/godot/godot-plugin/addons/claude_mcp/tools/script_validate.gd`
- changed `mcps/godot/godot-plugin/addons/claude_mcp/tools/tool_registry.gd`
- changed `mcps/godot/server/package.json`
- changed `mcps/godot/server/src/cli.ts`

### Other
- added `evals/README.md`
- added `evals/review-finds-bug/case.yaml`
- added `evals/review-finds-bug/graders/cites-line.md`
- added `evals/review-finds-bug/graders/finds-off-by-one.md`
- added `evals/review-finds-bug/graders/skill-fired.md`
- added `evals/review-finds-bug/scaffold.sh`
- added `evals/trigger-brainstorm/graders/skill-fired.md`
- added `evals/trigger-brainstorm/prompt.md`
- added `evals/trigger-capture/graders/skill-fired.md`
- added `evals/trigger-capture/prompt.md`
- added `evals/trigger-checkpoint/graders/skill-fired.md`
- added `evals/trigger-checkpoint/prompt.md`
- added `evals/trigger-pre-push/graders/skill-fired.md`
- added `evals/trigger-pre-push/prompt.md`
- added `evals/trigger-recap/graders/skill-fired.md`
- added `evals/trigger-recap/prompt.md`
- added `evals/trigger-rules/graders/skill-fired.md`
- added `evals/trigger-rules/prompt.md`
- added `evals/trigger-systematic-debugging/graders/skill-fired.md`
- added `evals/trigger-systematic-debugging/prompt.md`
- added `evals/trigger-work-state/graders/skill-fired.md`
- added `evals/trigger-work-state/prompt.md`
- added `evals/unrelated-arithmetic/graders/answer.md`
- added `evals/unrelated-arithmetic/graders/no-skill.md`
- added `evals/unrelated-arithmetic/prompt.md`
- added `evals/user-only-improve-prompt/graders/not-invoked.md`
- added `evals/user-only-improve-prompt/prompt.md`
- added `scripts/lint-skills.js`
- changed `.gitignore`
- changed `README.md`
- changed `cursor/rules/config-authoring.mdc`
- changed `scripts/build-plugin.js`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/cycle/agents/openai.yaml`
- added `skills/humanize/agents/openai.yaml`
- added `skills/improve-prompt/agents/openai.yaml`
- added `skills/new-hook/agents/openai.yaml`
- added `skills/new-mcp/agents/openai.yaml`
- added `skills/review/receipts.mjs`
- added `skills/review/receipts.test.mjs`
- added `skills/shortcuts/agents/openai.yaml`
- added `skills/visual/agents/openai.yaml`
- added `skills/visual/break.md`
- added `skills/visualise-codemap/agents/openai.yaml`
- changed `skills/blueprint/SKILL.md`
- changed `skills/brainstorm/SKILL.md`
- changed `skills/capture/SKILL.md`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/design-proposal/SKILL.md`
- changed `skills/improve-prompt/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/recap/SKILL.md`
- changed `skills/retrospect-core/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/angles.md`
- changed `skills/review/reconciliation.md`
- changed `skills/rules/SKILL.md`
- changed `skills/systematic-debugging/SKILL.md`
- changed `skills/visual/SKILL.md`
- changed `skills/work-state/SKILL.md`
- changed `skills/wrap/SKILL.md`

## 2026-10-27 — Multi-angle /review for local code and PRs, with /pr-review folded in; context hooks for file history, compaction and the codemap; cross-tool handoffs in project-memory; /shortcuts; a setup script for Claude Projects and other cloud agents; and asset_set_properties in the Unity MCP.

_33 added, 46 changed, 1 removed._

### Architectural rules
- added `architectural-rules/universal/mark-shortcuts.md`
- changed `architectural-rules/universal/change-discipline.md`
- changed `architectural-rules/universal/code-standards.md`
- changed `architectural-rules/universal/layering.md`
- changed `architectural-rules/universal/naming.md`
- changed `architectural-rules/universal/solid-and-responsibilities.md`

### Bootstrap
- changed `bootstrap/lib/enablement.js`
- changed `bootstrap/lib/settings.js`

### Commands
- added `commands/shortcuts.md`
- changed `commands/pr-review.md`
- changed `commands/review.md`

### Cross-tool instructions
- changed `.github/instructions/universal.instructions.md`

### Docs
- added `docs/claude-projects.md`
- changed `docs/checkpoint-organ.md`
- changed `docs/reference.md`
- changed `docs/review-organ.md`
- changed `docs/review-output-contract.md`
- changed `docs/skills-catalog.md`

### Hooks
- added `hooks/codemap-refresh.js`
- added `hooks/codemap-search-nudge.js`
- added `hooks/compact-snapshot.js`
- added `hooks/edit-checks.js`
- added `hooks/file-history-precheck.js`
- added `hooks/lib/codemap-state.js`
- added `hooks/lib/memory-root.js`
- added `hooks/tests/context-hooks.test.js`
- changed `hooks/hooks.json`
- changed `hooks/lib/hook-io.js`
- changed `hooks/rule-prime.js`

### MCP servers
- added `mcps/project-memory/src/tools/handoff.ts`
- added `mcps/project-memory/test/handoff.test.ts`
- added `mcps/unity/unity-package/Editor/Tools/Assets/AssetSetPropertiesTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Assets/AssetSetPropertiesTool.cs.meta`
- added `mcps/unity/unity-package/Tests/Editor/AssetSetPropertiesTestAsset.cs`
- added `mcps/unity/unity-package/Tests/Editor/AssetSetPropertiesTestAsset.cs.meta`
- added `mcps/unity/unity-package/Tests/Editor/AssetSetPropertiesToolTests.cs`
- added `mcps/unity/unity-package/Tests/Editor/AssetSetPropertiesToolTests.cs.meta`
- changed `mcps/project-memory/README.md`
- changed `mcps/project-memory/dist/project-memory.cjs`
- changed `mcps/project-memory/src/index.ts`
- changed `mcps/unity/README.md`
- changed `mcps/unity/unity-package/Editor/Tools/Components/PropertyValueCoercion.cs`

### Other
- added `cloud/copilot-setup-steps.yml`
- added `cloud/cursor-environment.json`
- added `cloud/setup.sh`
- changed `.claude-plugin/plugin.json`
- changed `README.md`
- changed `cursor/rules/universal.mdc`
- changed `scripts/build-plugin.js`
- changed `scripts/census-shims.js`

### Settings
- changed `settings/settings.local.json.example`
- changed `settings/settings.template.json`

### Skills
- added `skills/review/angles.md`
- added `skills/review/assets/example-findings.json`
- added `skills/review/assets/review-page.html`
- added `skills/review/drift-checks.md`
- added `skills/review/findings-schema.md`
- added `skills/review/pack.md`
- added `skills/review/render-note.mjs`
- added `skills/review/render-page.mjs`
- added `skills/review/save-run.mjs`
- added `skills/shortcuts/SKILL.md`
- added `skills/shortcuts/shortcuts.mjs`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/cycle/SKILL.md`
- changed `skills/discover/SKILL.md`
- changed `skills/human-view/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/recap/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/feedback-loop.md`
- changed `skills/review/pr-vault-iterations.md`
- changed `skills/review/reconciliation.md`
- changed `skills/review/vault-output.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/visualise-codemap/SKILL.md`
- changed `skills/visualise-codemap/visualise-codemap.mjs`
- removed `skills/pr-review/SKILL.md`

## 2026-10-26 — Every plugin now ships the project-memory MCP; Copilot gets the agents, Cursor gets hooks, Codex gets its own manifest, and contexture-lite plus an OpenCode hook plugin cover small and local models. The README lists /cycle, /visual and design-proposal.

_20 added, 10 changed, 1 removed._

### Cross-tool instructions
- added `.github/plugin/plugin.json`

### Docs
- changed `docs/reference.md`
- changed `docs/skills-catalog.md`

### Hooks
- added `hooks/lib/hook-io.test.js`
- changed `hooks/lib/hook-io.js`

### MCP servers
- added `mcps/project-memory/dist/project-memory.cjs`
- added `mcps/project-memory/scripts/bundle.mjs`
- changed `mcps/project-memory/package-lock.json`
- changed `mcps/project-memory/package.json`

### Other
- added `.codex-plugin/plugin.json`
- added `copilot/agents/c-sharp-pro.agent.md`
- added `copilot/agents/cpp-pro.agent.md`
- added `copilot/agents/mcp-py-pro.agent.md`
- added `copilot/agents/mcp-ts-pro.agent.md`
- added `copilot/agents/metal-video-source-pro.agent.md`
- added `copilot/agents/react-pro.agent.md`
- added `copilot/agents/rust-pro.agent.md`
- added `copilot/agents/security-reviewer.agent.md`
- added `copilot/agents/unity-pro.agent.md`
- added `copilot/agents/unity-ui-pro.agent.md`
- added `copilot/agents/vision-os-pro.agent.md`
- added `cursor/hooks.json`
- added `cursor/mcp.json`
- added `opencode/contexture.js`
- added `scripts/build-plugin.js`
- changed `.claude-plugin/marketplace.json`
- changed `.claude-plugin/plugin.json`
- changed `.cursor-plugin/plugin.json`
- changed `README.md`
- changed `scripts/build-gemini-extension.js`
- removed `scripts/build-plugin-hooks.js`

## 2026-10-26 — Contexture installs as a Claude Code plugin from its own marketplace, with each hook bundle as an on/off option; Copilot and Codex read the same manifest, Gemini CLI gets a built extension folder, and Cursor gets a plugin manifest and rules as .mdc files.

_26 added, 18 changed, 0 removed._

### Agents
- changed `agents/c-sharp-pro.md`
- changed `agents/cpp-pro.md`
- changed `agents/mcp-py-pro.md`
- changed `agents/mcp-ts-pro.md`
- changed `agents/metal-video-source-pro.md`
- changed `agents/react-pro.md`
- changed `agents/rust-pro.md`
- changed `agents/unity-pro.md`
- changed `agents/unity-ui-pro.md`
- changed `agents/vision-os-pro.md`

### Docs
- changed `docs/architectural-rules-overlay.md`

### Hooks
- added `hooks/hooks.json`
- added `hooks/plugin-gate.js`
- changed `hooks/lib/hook-io.js`
- changed `hooks/lib/resolve-rules.js`
- changed `hooks/rule-prime.js`

### Other
- added `.claude-plugin/marketplace.json`
- added `.claude-plugin/plugin.json`
- added `.cursor-plugin/plugin.json`
- added `cursor/rules/android.mdc`
- added `cursor/rules/bash.mdc`
- added `cursor/rules/codecs.mdc`
- added `cursor/rules/config-authoring.mdc`
- added `cursor/rules/core.mdc`
- added `cursor/rules/cpp.mdc`
- added `cursor/rules/csharp.mdc`
- added `cursor/rules/godot.mdc`
- added `cursor/rules/linux.mdc`
- added `cursor/rules/openxr.mdc`
- added `cursor/rules/python.mdc`
- added `cursor/rules/rendering.mdc`
- added `cursor/rules/rust.mdc`
- added `cursor/rules/sql.mdc`
- added `cursor/rules/typescript.mdc`
- added `cursor/rules/unity.mdc`
- added `cursor/rules/universal.mdc`
- added `cursor/rules/web.mdc`
- added `cursor/rules/webrtc.mdc`
- added `scripts/build-gemini-extension.js`
- added `scripts/build-plugin-hooks.js`
- changed `README.md`

### Skills
- changed `skills/capture/SKILL.md`
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/rules/SKILL.md`

## 2026-10-26 — Added /cycle, an unattended dev loop from audit to PR, the visual organ for design captures and checks, and design-proposal pages; a citation check in the agent-output hook, a refuting verifier in pr-review, and new rules for contract enforcement, invocation control, C++ naming and over-delivery.

_37 added, 37 changed, 1 removed._

### Agents
- changed `agents/security-reviewer.md`

### Architectural rules
- added `architectural-rules/config-authoring/contract-enforcement.md`
- added `architectural-rules/config-authoring/invocation-control.md`
- added `architectural-rules/cpp/naming.md`
- added `architectural-rules/universal/over-delivery-tells.md`
- changed `architectural-rules/config-authoring/thresholds.md`
- changed `architectural-rules/csharp/naming.md`
- changed `architectural-rules/universal/naming.md`
- changed `architectural-rules/universal/skill-auto-fire.md`
- changed `architectural-rules/universal/test-quality.md`

### CLAUDE.md imports
- changed `claude-md/memory-capture.md`

### Commands
- added `commands/cycle.md`
- added `commands/visual.md`
- changed `commands/humanize.md`
- changed `commands/improve-prompt.md`
- changed `commands/new-hook.md`
- changed `commands/new-mcp.md`
- changed `commands/visualise-codemap.md`

### Cross-tool instructions
- changed `.github/instructions/config-authoring.instructions.md`
- changed `.github/instructions/cpp.instructions.md`
- changed `.github/instructions/csharp.instructions.md`
- changed `.github/instructions/universal.instructions.md`

### Docs
- added `docs/cycle-contract.md`
- changed `docs/reference.md`
- changed `docs/skills-catalog.md`

### Hooks
- added `hooks/lib/cite-check.js`
- added `hooks/tests/agent-output-cite-check.test.js`
- changed `hooks/agent-output-contract-validator.js`

### MCP servers
- changed `mcps/project-memory/test/score.test.ts`

### Other
- added `scripts/update-config.ps1`
- changed `.githooks/post-checkout`
- changed `.githooks/post-merge`
- changed `.githooks/post-rewrite`
- removed `.githooks/commit-msg`

### Skills
- added `skills/cycle/SKILL.md`
- added `skills/cycle/config-defaults.md`
- added `skills/cycle/contract-defaults.md`
- added `skills/cycle/cycle-contract.md`
- added `skills/cycle/cycle-loop.mjs`
- added `skills/cycle/cycle-state.mjs`
- added `skills/cycle/projects-template.md`
- added `skills/cycle/status-page.html`
- added `skills/cycle/test/cycle-loop.test.mjs`
- added `skills/cycle/test/cycle-state.test.mjs`
- added `skills/cycle/test/fixtures/draw-tree.mjs`
- added `skills/cycle/test/fixtures/setup-missing-engine.md`
- added `skills/cycle/test/fixtures/stub-claude.mjs`
- added `skills/cycle/test/fixtures/stub-gh.mjs`
- added `skills/cycle/test/fixtures/stub-tamper.mjs`
- added `skills/design-proposal/SKILL.md`
- added `skills/design-proposal/assets/annotation-layer.css`
- added `skills/design-proposal/assets/annotation-layer.js`
- added `skills/design-proposal/assets/page-shell.html`
- added `skills/design-proposal/references/page-recipe.md`
- added `skills/visual/SKILL.md`
- added `skills/visual/contract-defaults.json`
- added `skills/visual/package-lock.json`
- added `skills/visual/package.json`
- added `skills/visual/test/fixtures/draw.mjs`
- added `skills/visual/test/visual.test.mjs`
- added `skills/visual/visual.mjs`
- changed `skills/deliver/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/humanize/SKILL.md`
- changed `skills/improve-prompt/SKILL.md`
- changed `skills/memory-audit/SKILL.md`
- changed `skills/new-hook/SKILL.md`
- changed `skills/new-mcp/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/retrospect-core/SKILL.md`
- changed `skills/review/SKILL.md`
- changed `skills/update-codemap/treesitter.mjs`
- changed `skills/visualise-codemap/SKILL.md`
- changed `skills/visualise-codemap/visualise-codemap.mjs`

## 2026-07-30 — Advisor-style delegation hardened into a standing brief contract (five fields, pointers not pastes, bounded repair with session-safe retries), the always-on floor fitted back under its budget with landmine-first eviction, a four-class prohibition doctrine with the corpus audited to it and skill descriptions cut to triggers-only, a context-cost instrument so disclosure claims cite numbers, an authoritative session-liveness check, two new universal rules (deterministic resource release, escape hatches as exceptions), and a cross-tool projection drift check in verify.

_7 added, 81 changed, 1 removed._

### Architectural rules
- added `architectural-rules/config-authoring/disclosure-claims.md`
- added `architectural-rules/config-authoring/prohibitions-and-guidance-forms.md`
- added `architectural-rules/universal/escape-hatches.md`
- added `architectural-rules/universal/resource-release.md`
- changed `architectural-rules/README.md`
- changed `architectural-rules/cpp/error-paths.md`
- changed `architectural-rules/cpp/headers.md`
- changed `architectural-rules/cpp/modern-cpp-raii.md`
- changed `architectural-rules/cpp/ownership.md`
- changed `architectural-rules/csharp/naming.md`
- changed `architectural-rules/rust/dependability.md`
- changed `architectural-rules/rust/documentation.md`
- changed `architectural-rules/rust/error-handling.md`
- changed `architectural-rules/rust/flexibility.md`
- changed `architectural-rules/rust/future-proofing.md`
- changed `architectural-rules/rust/interoperability.md`
- changed `architectural-rules/rust/macros.md`
- changed `architectural-rules/rust/naming.md`
- changed `architectural-rules/rust/predictability.md`
- changed `architectural-rules/rust/type-safety.md`
- changed `architectural-rules/unity/component-design.md`
- changed `architectural-rules/unity/input-actions-on-pointer.md`
- changed `architectural-rules/unity/meta-files.md`
- changed `architectural-rules/unity/namespaces-and-imports.md`
- changed `architectural-rules/unity/serialization-and-inspector.md`
- changed `architectural-rules/unity/ugui-skill-usage.md`
- changed `architectural-rules/unity/ui-code.md`
- changed `architectural-rules/unity/uitoolkit-uss-limits.md`
- changed `architectural-rules/universal/canonical-commands.md`
- changed `architectural-rules/universal/change-discipline.md`
- changed `architectural-rules/universal/code-standards.md`
- changed `architectural-rules/universal/config-is-truth.md`
- changed `architectural-rules/universal/deep-modules.md`
- changed `architectural-rules/universal/docs-and-comments.md`
- changed `architectural-rules/universal/focused-execution.md`
- changed `architectural-rules/universal/git-workflow.md`
- changed `architectural-rules/universal/git.md`
- changed `architectural-rules/universal/layering.md`
- changed `architectural-rules/universal/naming.md`
- changed `architectural-rules/universal/prose-authenticity.md`
- changed `architectural-rules/universal/skill-auto-fire.md`
- changed `architectural-rules/universal/solid-and-responsibilities.md`
- changed `architectural-rules/universal/test-quality.md`
- changed `architectural-rules/web/async.md`
- changed `architectural-rules/web/layering.md`
- changed `architectural-rules/web/state.md`

### Bootstrap
- changed `bootstrap/bootstrap.js`
- changed `bootstrap/lib/enablement.js`
- changed `bootstrap/lib/verify.js`

### CLAUDE.md imports
- changed `claude-md/_imports.md`

### Commands
- changed `commands/wrap.md`

### Cross-tool instructions
- changed `.github/instructions/config-authoring.instructions.md`
- changed `.github/instructions/universal.instructions.md`
- changed `.github/instructions/web.instructions.md`

### Hooks
- changed `hooks/agent-output-contract-validator.js`
- changed `hooks/lib/glob-files.js`
- changed `hooks/lib/resolve-rules.js`
- changed `hooks/rule-prime.js`

### Other
- added `scripts/context-cost.example.json`
- added `scripts/context-cost.js`
- changed `scripts/lint-rules.js`
- removed `CHANGELOG.md`

### Skills
- added `skills/humanize/references/ai-vocabulary.v2.md`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/coordinate/SKILL.md`
- changed `skills/dispatch/SKILL.md`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/extract-conventions/SKILL.md`
- changed `skills/humanize/SKILL.md`
- changed `skills/humanize/references/email.md`
- changed `skills/humanize/references/project-internal.md`
- changed `skills/humanize/references/tech-doc.md`
- changed `skills/improve-prompt/SKILL.md`
- changed `skills/new-hook/SKILL.md`
- changed `skills/new-hook/recipes/rule-prime/template.js`
- changed `skills/new-mcp/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/pr-triage/SKILL.md`
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/recap/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/update-codemap/test/fixtures.mjs`
- changed `skills/update-codemap/treesitter.mjs`
- changed `skills/wrap/SKILL.md`
- changed `skills/wrap/backlog-sweep.mjs`
- changed `skills/write-tests/SKILL.md`
