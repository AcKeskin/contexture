# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-06-24 — Add the Unity MCP build-profiler tool domain: build_player/build_status (async build via poll handle), set_build_target, build_scenes_get/set, profiler_capture, and playmode_step

_71 added, 17 changed, 3 removed._

### Commands
- added `commands/pr-triage.md`
- removed `commands/pr-respond.md`

### Docs
- changed `docs/reference.md`
- changed `docs/review-output-contract.md`

### MCP servers
- added `mcps/unity/server/PROCEDURES.md`
- added `mcps/unity/server/scripts/check-tool-list-changed.mjs`
- added `mcps/unity/server/test/procedure-refs.test.ts`
- added `mcps/unity/server/test/procedure-runner.test.ts`
- added `mcps/unity/server/tsconfig.test.json`
- added `mcps/unity/unity-package/Editor/Tools/Build.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildJob.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildJob.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildJobRegistry.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildJobRegistry.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildPlayerTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildPlayerTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildScenesGetTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildScenesGetTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildScenesSetTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildScenesSetTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildStatusTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/BuildStatusTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Build/SetBuildTargetTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Build/SetBuildTargetTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Diff.meta`
- added `mcps/unity/unity-package/Editor/Tools/Diff/StructuralDiff.cs`
- added `mcps/unity/unity-package/Editor/Tools/Diff/StructuralDiff.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorGetDirtyStateTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorGetDirtyStateTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorGetSelectionTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorGetSelectionTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorRedoTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorRedoTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorSelectTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorSelectTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorUndoRedo.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorUndoRedo.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorUndoTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/EditorUndoTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/PlaymodeStepTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/PlaymodeStepTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/ProfilerCaptureTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/ProfilerCaptureTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Editor/ProfilerStatCatalog.cs`
- added `mcps/unity/unity-package/Editor/Tools/Editor/ProfilerStatCatalog.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/FullDump.cs`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/FullDump.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/GoDiffTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/GoDiffTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/GoSerializeFullTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/GameObjects/GoSerializeFullTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabApplyOverrideTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabApplyOverrideTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabCreateVariantTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabCreateVariantTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabDiffTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabDiffTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabEditTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabEditTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabOverrideResolver.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabOverrideResolver.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabOverridesTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabOverridesTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabReplaceAssetTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabReplaceAssetTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabRevertOverrideTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabRevertOverrideTool.cs.meta`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabUnpackTool.cs`
- added `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabUnpackTool.cs.meta`
- added `mcps/unity/unity-package/Tests/Editor/SerializedFieldDumperFullFidelityTests.cs`
- added `mcps/unity/unity-package/Tests/Editor/SerializedFieldDumperFullFidelityTests.cs.meta`
- added `mcps/unity/unity-package/Tests/Editor/StructuralDiffTests.cs`
- added `mcps/unity/unity-package/Tests/Editor/StructuralDiffTests.cs.meta`
- changed `mcps/unity/README.md`
- changed `mcps/unity/server/.gitignore`
- changed `mcps/unity/server/package.json`
- changed `mcps/unity/server/src/index.ts`
- changed `mcps/unity/server/src/procedure-runner.ts`
- changed `mcps/unity/unity-package/Editor/Tools/InstanceIdResolver.cs`
- changed `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabApplyOverridesTool.cs`
- changed `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabCreateFromTool.cs`
- changed `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabInstantiateTool.cs`
- changed `mcps/unity/unity-package/Editor/Tools/Prefabs/PrefabRevertTool.cs`
- changed `mcps/unity/unity-package/Editor/Tools/SerializedFieldDumper.cs`

### Other
- removed `CHANGELOG.md`

### Skills
- added `skills/pr-triage/SKILL.md`
- changed `skills/pr-author/SKILL.md`
- changed `skills/pr-review/SKILL.md`
- changed `skills/pre-push/SKILL.md`
- changed `skills/review/SKILL.md`
- removed `skills/pr-respond/SKILL.md`
