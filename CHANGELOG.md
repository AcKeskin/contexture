# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-07-25 — Executor-grade plans and verification-gated tier routing, prior-art grounding for port work, and the threshold-discipline rule. Plans can be authored for an executor that does not share the session; a step routes to a cheaper tier only when a command can catch it being wrong. Spec reads an existing implementation as the requirements baseline for ports. A new config-authoring rule bars bare counts from standing in for judgment calls. Also folds in the session-scoped scratch memory tier, the new-agent authoring gates, coordinate board identity and liveness, and the skills/rules alignment sweeps.

_9 added, 119 changed, 6 removed._

### Architectural rules
- added `architectural-rules/config-authoring/thresholds.md`
- changed `architectural-rules/README.md`
- changed `architectural-rules/bash/quoting.md`
- changed `architectural-rules/cpp/error-paths.md`
- changed `architectural-rules/cpp/headers.md`
- changed `architectural-rules/cpp/interfaces-and-abi.md`
- changed `architectural-rules/cpp/modern-cpp-raii.md`
- changed `architectural-rules/cpp/move-semantics.md`
- changed `architectural-rules/cpp/ownership.md`
- changed `architectural-rules/cpp/performance.md`
- changed `architectural-rules/cpp/templates.md`
- changed `architectural-rules/csharp/events-and-delegates.md`
- changed `architectural-rules/csharp/generics-and-constraints.md`
- changed `architectural-rules/csharp/naming.md`
- changed `architectural-rules/csharp/value-types-and-allocs.md`
- changed `architectural-rules/godot/editor-plugins.md`
- changed `architectural-rules/linux/ipc-and-signals.md`
- changed `architectural-rules/openxr/input-actions.md`
- changed `architectural-rules/openxr/lifecycle-and-sessions.md`
- changed `architectural-rules/openxr/spaces-and-tracking.md`
- changed `architectural-rules/python/packaging.md`
- changed `architectural-rules/python/typing.md`
- changed `architectural-rules/rendering/compute-and-gpgpu.md`
- changed `architectural-rules/rendering/shaders.md`
- changed `architectural-rules/rust/flexibility.md`
- changed `architectural-rules/unity/component-design.md`
- changed `architectural-rules/unity/input-actions-on-pointer.md`
- changed `architectural-rules/unity/ugui-skill-usage.md`
- changed `architectural-rules/unity/uitoolkit-uss-limits.md`
- changed `architectural-rules/universal/canonical-commands.md`
- changed `architectural-rules/universal/config-is-truth.md`
- changed `architectural-rules/universal/docs-and-comments.md`
- changed `architectural-rules/universal/git-workflow.md`
- changed `architectural-rules/universal/prose-authenticity.md`
- changed `architectural-rules/universal/session-scope-boundary.md`
- changed `architectural-rules/universal/skill-auto-fire.md`
- changed `architectural-rules/web/async.md`
- changed `architectural-rules/web/layering.md`
- changed `architectural-rules/web/state.md`
- changed `architectural-rules/webrtc/media-and-tracks.md`

### Bootstrap
- changed `bootstrap/bootstrap.js`
- changed `bootstrap/lib/mcps.js`
- changed `bootstrap/lib/platform.js`
- changed `bootstrap/lib/settings.js`
- changed `bootstrap/lib/verify.js`
- removed `bootstrap/lib/ccline.js`

### Commands
- changed `commands/checkpoint.md`
- removed `commands/retrospect.md`
- removed `commands/system-review.md`

### Cross-tool instructions
- changed `.github/instructions/bash.instructions.md`
- changed `.github/instructions/cpp.instructions.md`
- changed `.github/instructions/csharp.instructions.md`
- changed `.github/instructions/godot.instructions.md`
- changed `.github/instructions/linux.instructions.md`
- changed `.github/instructions/openxr.instructions.md`
- changed `.github/instructions/python.instructions.md`
- changed `.github/instructions/rendering.instructions.md`
- changed `.github/instructions/rust.instructions.md`
- changed `.github/instructions/unity.instructions.md`
- changed `.github/instructions/universal.instructions.md`
- changed `.github/instructions/web.instructions.md`
- changed `.github/instructions/webrtc.instructions.md`

### Docs
- added `docs/skills-catalog.md`
- changed `docs/architectural-rules.md`
- changed `docs/bootstrap.md`
- changed `docs/changelog-contract.md`
- changed `docs/checkpoint-organ.md`
- changed `docs/plan-execute-workflow.md`
- changed `docs/prep-organ.md`
- changed `docs/reference.md`
- changed `docs/review-organ.md`
- changed `docs/review-output-contract.md`
- changed `docs/scope-resolution-manifests.md`
- changed `docs/statusline.md`
- changed `docs/wrap-organ.md`

### Hooks
- added `hooks/statusline.js`

### MCP servers
- added `mcps/project-memory/src/lib/scratch.ts`
- added `mcps/project-memory/src/tools/write-memory.ts`
- added `mcps/project-memory/test/scratch.test.ts`
- added `mcps/project-memory/test/write-memory.test.ts`
- changed `mcps/project-memory/src/index.ts`
- changed `mcps/project-memory/src/retrieval/score.ts`
- changed `mcps/project-memory/src/tools/discover.ts`
- changed `mcps/project-memory/test/score.test.ts`

### Other
- changed `README.md`
- removed `CHANGELOG.md`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/checkpoint/corpus-passes.md`
- added `skills/review/reconciliation.md`
- changed `skills/autonomize/SKILL.md`
- changed `skills/blueprint/SKILL.md`
- changed `skills/capture/SKILL.md`
- changed `skills/capture/secret-patterns.md`
- changed `skills/checkpoint/SKILL.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/coordinate/SKILL.md`
- changed `skills/deliver/SKILL.md`
- changed `skills/discover/SKILL.md`
- changed `skills/dispatch/SKILL.md`
- changed `skills/draft-plan/SKILL.md`
- changed `skills/envision/SKILL.md`
- changed `skills/execute/SKILL.md`
- changed `skills/extract-conventions/SKILL.md`
- changed `skills/glossary/SKILL.md`
- changed `skills/human-view/SKILL.md`
- changed `skills/humanize/SKILL.md`
- changed `skills/memory-audit/SKILL.md`
- changed `skills/new-agent/SKILL.md`
- changed `skills/new-agents-md/SKILL.md`
- changed `skills/new-hook/SKILL.md`
- changed `skills/orchestrate/SKILL.md`
- changed `skills/pr-author/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/pr-review/vault-iterations.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/prep/SKILL.md`
- changed `skills/recap/SKILL.md`
- changed `skills/retrospect-core/SKILL.md`
- changed `skills/review/OUT-OF-SCOPE.md`
- changed `skills/review/SKILL.md`
- changed `skills/review/vault-output.md`
- changed `skills/spec/SKILL.md`
- changed `skills/systematic-debugging/defense-in-depth.md`
- changed `skills/test-driven-development/SKILL.md`
- changed `skills/test-driven-development/testing-anti-patterns.md`
- changed `skills/update-changelog/SKILL.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/using-git-worktrees/SKILL.md`
- changed `skills/visualise-codemap/SKILL.md`
- changed `skills/work-state/SKILL.md`
- changed `skills/wrap/SKILL.md`
- changed `skills/write-tests/SKILL.md`
- removed `skills/retrospect/SKILL.md`
- removed `skills/system-review/SKILL.md`
