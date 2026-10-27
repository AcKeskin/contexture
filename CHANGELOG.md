# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.





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
