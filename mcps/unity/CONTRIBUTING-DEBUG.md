# Debugging unity-mcp

The single page a new user needs to navigate the MCP, run its tests, and diagnose failures. Each section is owned by one v2 plan step — when behavior changes, the owning step updates this page in the same edit. If something here doesn't match what you observe, the page is wrong; file an issue.

## How smoke works

The MCP has two halves connected over local HTTP:

- **Server** — a TypeScript stdio MCP server in [`server/`](./server/). Started by an MCP client (Claude Code / Cursor / etc.). Reads the registry to discover the running Unity Editor and forwards tool calls to it.
- **Editor package** — a Unity package in [`unity-package/`](./unity-package/) that runs an `HttpListener` on `127.0.0.1:<port>` whenever Unity is open. Auto-starts via `[InitializeOnLoad]`.

Two smoke harnesses, both in [`server/scripts/`](./server/scripts/):

| Command | What it does |
|---|---|
| `npm run smoke` | v1 baseline — round-trips the original six tools. Fast (~3 s). |
| `npm run smoke:v2` | v2 extended harness. Section flags: `--only Scene` / `GameObject` / `Component` / `Asset` / `Prefab` / `Vision` / `XRI` / `MRTK3` / `CustomTools` / `Logging`. Verbosity flags: `--play-mode` (head-pose write+capture-diff for criterion #5), `--include-scene-save` (commits the active scene to disk), `--include-custom-tools` (writes a stub `.cs` into `Assets/` and flips the package config flag for the opt-in cycle). Default mode is non-destructive. |

Both require:

1. Unity is open with the unity-mcp package installed (referenced via `Packages/manifest.json` as `"com.ackeskin.unity-mcp": "file:..."`).
2. Server is built: `cd server && npm run build`.

To run:

```bash
cd mcps/unity/server
npm run build
npm run smoke:v2
```

Each section emits `[smoke:v2] [<Section>/<state>] <message>` lines so failures pinpoint which assertion regressed.

## Where the registry lives

The Editor writes a JSON entry under:

```
~/.claude/unity-mcp/instances/<projectId>.json
```

Example contents:

```json
{
  "projectId": "MRTK3Sample@b65b12",
  "projectPath": "...",
  "projectName": "MRTK3 Sample",
  "unityVersion": "6000.3.12f1",
  "port": 6400,
  "pid": 36520,
  "startedAt": "2026-05-07T09:08:10.224Z"
}
```

The server picks the most-recently-started entry as the active target. If you're seeing `BridgeUnreachable` from `tools/list`:

1. Confirm the file exists: `ls ~/.claude/unity-mcp/instances/`.
2. If it's missing, focus the Unity Editor (it'll re-register on the next domain-load tick).
3. If it's stale (PID dead), the server should prune it on the next read. Force-prune by deleting it manually.

## How to read the logs

Both halves emit structured lines you can grep. Every tool invocation produces **four lines total** — start + ok/err on each side — keyed by a shared 8-char correlation ID prefix.

**Editor side** (Unity Console, filter `[UnityMCP]`):

```
[UnityMCP] HTTP host bound on http://127.0.0.1:6400/        ← boot
[UnityMCP] registry entry written: ...                       ← boot
[UnityMCP] boot complete on port 6400, 44 tools registered.  ← boot

[UnityMCP] 8a2f1c4b project_info start                       ← per call
[UnityMCP] 8a2f1c4b project_info ok 3ms                      ← per call
[UnityMCP] 7f0d83b2 component_set_property err InvalidInput 12ms unsupportedType=AnimationCurve
```

**Server side** (stderr, filter `[unity-mcp]`):

```
[unity-mcp] 8a2f1c4b project_info start                      ← per call
[unity-mcp] 8a2f1c4b project_info ok 5ms                     ← per call
```

The `8a2f1c4b` prefix is the **same** UUID on both sides — grep for it to trace any individual call across the bridge. Each call's server `start` precedes its editor `start`; each editor `ok|err` precedes the server's matching line by ~1-3ms (the round-trip).

**Verbosity** is controlled via `UNITY_MCP_LOG_LEVEL` env var:

- unset / `all` → emit start + ok/err on both sides (default)
- `errors-only` / `err` → suppress non-error lines on both sides

The smoke harness's `## Logging` section asserts every per-call correlation ID appears on both halves with matching tool name (criterion #7).

## What domain-reload survival looks like in logs

When you save a `.cs` file under `Assets/` (or focus Unity to pick up package edits), Unity recompiles. Expected sequence in the Editor console:

```
[UnityMCP] HTTP host bound on http://127.0.0.1:6400/   ← post-reload boot
[UnityMCP] registry entry written: ...
[UnityMCP] boot complete on port 6400, 6 tools registered.
```

Port 6400 should be preserved (the same port the listener was on before reload). If you see `previous port 6400 unavailable; rebound on <other>`, something else grabbed the port during the reload window — uncommon but harmless; the new port goes into the registry and the server picks it up via cache invalidation on the next call.

You can verify reload survival end-to-end without leaving the terminal:

```bash
cd mcps/unity/server
node scripts/check-reload.mjs --timeout-ms 60000
# … focus Unity to trigger a recompile …
# Expected: [check-reload] OK — entry reappeared after gap (or registry mtime advanced).
```

## How the server recovers from a vanished Editor

If the Editor process dies (or the registry file is removed) mid-session:

1. The next `tools/call` on the server side returns `BridgeUnreachable` with a clean error message.
2. The capability-descriptor cache is invalidated automatically.
3. When the Editor comes back, the next `tools/list` re-fetches `/capabilities` and works again.

The server itself never exits. Verify with:

```bash
node scripts/check-reload-server.mjs
# Expected: server survived a registry-vanish cycle.
```

## Cost of the registry watcher

The MCP server polls the registry directory every 5 seconds to spot Editor-side rewrites (port changes, recompiles). Benchmark output (60s sample on Win11):

```
wallMs:        60006.59
cpuPercent:    0.0517
status:        PASS  (≤ 1% budget)
```

Run the bench yourself with:

```bash
node scripts/bench-registry-watch.mjs
```

If you ever see `cpuPercent` materially over 1%, file an issue — the implementation should switch to event-based `fs.watch` at that point.

## How tool gating works

Tools declare `Requires = new[] { CapabilityKey.Xri }` (or other keys) in their `[UnityMcpTool]` attribute. `tools/list` only includes tools whose `Requires` is satisfied by the live capability set. The descriptor exposes the full active set under `descriptor.capabilities`:

```bash
curl -s http://127.0.0.1:6400/capabilities | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).capabilities))"
# ["builtin","testFramework","xri","xri.eyeGaze","xri.hands"]
```

Verify that ungated tools always appear:

```bash
node scripts/check-gating.mjs
```

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `tools/list` empty | Editor not running, or registry pruned | Open Unity; re-check `~/.claude/unity-mcp/instances/`. |
| `BridgeUnreachable` on every call | Port collision or PID stale | Restart Unity; check the registry entry's `pid` is alive. |
| `tools/list` missing expected `xri_*` / `mrtk3_*` tools | Capability not detected | `curl /capabilities` and inspect `descriptor.capabilities`. If the package is installed but absent from the array, file an issue with the package list. |
| `mrtk: null` despite MRTK 3 being in the project | MRTK 3 loaded as embedded source rather than UPM package | Detector now also probes loaded assemblies for `Microsoft.MixedReality.Toolkit.*` and `MixedReality.Toolkit.*` (no Microsoft prefix — the dev-template fork). |
| `Asmdef "Unity.XR.Interaction.Toolkit" not found` warning on package import | Project doesn't have XRI installed | Warning is harmless — the unity-mcp package compiles; XRI-typed code is `#if`-gated on `UNITY_MCP_HAS_XRI` and won't run. The 5 `xri_*` and 2 XR-aware vision tools won't surface in `tools/list`. To silence: install `com.unity.xr.interaction.toolkit ≥ 2.0.0`. (Asmdef-split to make these references genuinely optional is tracked as v3 work.) |
| Editor logs `[UnityMCP] failed to instantiate tool` | Custom-tool ctor threw | Read the exception message; the offending tool is named in the log. |
| Editor logs `[UnityMCP] duplicate tool name` | Custom tool name collides with built-in | Rename the custom tool. Built-ins win — see plan Step 21. |

## Where each tool lives

```
unity-package/Editor/
├── Boot.cs                         entry point — InitializeOnLoad
├── PackageConfig.cs                reads unityMcp.* block from package.json
├── Bridge/
│   ├── HttpHost.cs                 listener + dispatch
│   ├── MainThreadDispatcher.cs     marshals to Unity main thread
│   ├── ReloadHandler.cs            domain-reload survival (plan Step 1)
│   └── InvocationLog.cs            paired correlation-ID logging (Step 23)
├── Capabilities/
│   ├── CapabilityKey.cs            sealed enum + wire round-trip
│   ├── CapabilitySet.cs            immutable bundle
│   ├── CapabilityDetector.cs       package + assembly + RP detection
│   └── CapabilityDescriptor.cs     /capabilities JSON shape
├── Tools/
│   ├── ToolRegistry.cs             reflection-based discovery + gating
│   ├── UnityMcpToolAttribute.cs    [UnityMcpTool("name", Requires = ...)]
│   ├── IUnityMcpTool.cs            handler contract
│   ├── ToolException.cs            structured-error throw type
│   ├── ToolResult.cs               application/json or image/png envelope
│   ├── InstanceIdResolver.cs       shared instanceId-to-Object lookup
│   ├── Vector3Json.cs              shared Vector3/Quaternion JSON helpers
│   ├── SerializedFieldDumper.cs    SerializedObject → JSON
│   ├── Scenes/                     scene_load / save / create / set_active / info
│   ├── GameObjects/                go_create / find / delete / set_transform / parent / active / serialize
│   ├── Components/                 component_add / remove / list / set_property + PropertyValueCoercion
│   ├── Assets/                     asset_create / delete / find / get_dependencies / import
│   ├── Prefabs/                    prefab_create_from / instantiate / apply / revert
│   ├── Vision/                     view_game / scene_from / scene_orbit / inspector_preview / xr_simulator / user_perspective
│   ├── XRI/                        xri_get_rig / inspect_interactor / interactable / get_input_actions / simulate_pose + XrRigLookup
│   ├── Editor/                     playmode_set (Play Mode control with bounded await)
│   └── Mrtk3/                      mrtk3_list_uxcomponents / inspect_button / handmenu / bounds_control / object_manipulator / validate_component + ValidationRules/
```

44 tools total against MRTKDevTemplate. The `XRI/` and `Mrtk3/` folders are gated on capability detection — they only surface in `tools/list` when XRI / MRTK 3 are detected in the running project.

## How to add a custom tool

Project-local custom tools are off by default. To enable:

1. In `unity-package/package.json`, set `"unityMcp": { "customToolsEnabled": true }`.
2. Anywhere under your project's `Assets/`, write a class that implements `UnityMcp.Editor.Tools.IUnityMcpTool` and is decorated with `[UnityMcpTool("your_tool_name")]`. Your project's asmdef needs to reference `UnityMcp.Editor`. Minimal example:

   ```csharp
   using System.Threading.Tasks;
   using Newtonsoft.Json.Linq;
   using UnityMcp.Editor.Tools;

   namespace MyProject.Tools
   {
       [UnityMcpTool("my_count_objects")]
       public sealed class MyCountObjectsTool : IUnityMcpTool
       {
           public string Name => "my_count_objects";
           public string Description => "Count GameObjects in the active scene.";
           public JObject InputSchema => new JObject
           {
               ["type"] = "object",
               ["additionalProperties"] = false,
           };

           public Task<ToolResult> InvokeAsync(JObject @params, ToolContext ctx)
           {
               var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
               int count = scene.GetRootGameObjects().Length;
               return Task.FromResult(ToolResult.Json(new JObject { ["count"] = count }));
           }
       }
   }
   ```

3. Focus Unity to recompile. Boot log line should report `customTools=True` and the new tool surfaces in the next `tools/list` call (the server's capability cache invalidates on registry rewrite).

**Naming-collision policy**: if your tool name matches a built-in (e.g. `scene_info`), the custom tool is rejected — built-ins always win. The Editor console logs `[UnityMCP] custom tool name 'X' on YourTool collides with a built-in; rejecting custom`.

Verify the opt-in cycle end-to-end:

```bash
node scripts/smoke-v2.mjs --only CustomTools --include-custom-tools
```

The harness writes a stub, flips the flag, polls `tools/list` until the tool surfaces, then restores both. **The opt-in cycle modifies your project's `Assets/` and the package's `package.json`**; restoration is best-effort. Run it deliberately, not by accident.

## Don't manually create .meta files

Unity auto-generates `.cs.meta`, `.asmdef.meta`, `.json.meta` files. If you create a new C# file in this package, open Unity (or alt-tab to it) — the meta file will appear. **Never write meta files by hand**, that's how GUIDs collide and prefab references break.

The one exception is **renaming a folder** — Unity needs the matching `<FolderName>.meta` to keep the folder GUID stable, so `mv Tools/Foo Tools/Bar` should be paired with `mv Tools/Foo.meta Tools/Bar.meta`. Pure rename only; do not edit meta contents.

## Knowledge corpus (`Editor/Mrtk3Knowledge/`)

The MRTK 3 knowledge layer answers *when / why / how* to use a component, separate from the *what* the inspector tools surface. Two MCP tools sit on top of one curated YAML corpus:

- `mrtk3_describe_component` — by name (`PressableButton`) or by `componentInstanceId` (walks the type chain so subclasses inherit the base entry).
- `mrtk3_list_prefabs` — curated catalog with `category` + `canvas` filters; every item carries `package` + `packageInstalled`.

The corpus lives at `unity-package/Editor/Mrtk3Knowledge/`:

```
Editor/Mrtk3Knowledge/
├── pressable-button.yaml          ← 12 component files (kind: component)
├── slider.yaml
├── ...
├── canvas-vs-noncanvas-decision.yaml  ← 3 decision-rule files (kind: decision-rule)
├── theming-pattern.yaml
├── audio-feedback-pattern.yaml
├── prefabs.yaml                   ← single prefab catalog (kind: prefab-catalog, ~47 entries)
└── Fixtures/                      ← negative-test fixtures for the validator (excluded from the live corpus)
```

### Schema reference

POCOs that the YAML deserializes into:
- [Mrtk3KnowledgeEntry.cs](unity-package/Editor/Mrtk3Knowledge/Mrtk3KnowledgeEntry.cs) — components + decision-rules share this type; nullable optional fields branch by `kind`.
- [Mrtk3PrefabCatalogEntry.cs](unity-package/Editor/Mrtk3Knowledge/Mrtk3PrefabCatalogEntry.cs) — prefab catalog rows.
- [Mrtk3PackagePath.cs](unity-package/Editor/Mrtk3Knowledge/Mrtk3PackagePath.cs) — `(package, path)` record for path-bearing fields.

Field shape mirrors spec [v2](.claude/specs/unity-mcp-mrtk3-knowledge/v2.md) §"Schema (per component file)" — keep that as the canonical reference.

### Path resolution: package-aware, soft-skip absent packages

Every path-bearing field — `sourceFile`, `canvasVariants.{canvas,nonCanvas}.path`, prefab `path` — is a `(package, path)` pair where `path` is **package-relative** (e.g. `Button/PressableButton.cs`, not `Packages/org.mixedrealitytoolkit.uxcore/Button/PressableButton.cs`). `Mrtk3PathResolver.Resolve` returns a tri-state:

- **Resolved** — package installed in the current Editor project AND the path exists. Validator silent-passes.
- **PathMissing** — package installed but the path is stale (corpus drift). Validator emits one `Debug.LogWarning` per offending file; the file is excluded from the live corpus.
- **PackageMissing** — package isn't installed in this project. **Validator soft-skips silently.** This is what makes the corpus install-agnostic.

Tools surface the same distinction differently:
- `mrtk3_describe_component` adds `_envelope.packageInstalled` (true / false / null) to the JSON output. Agents read this to know whether to suggest `npm install …` style guidance to the user.
- `mrtk3_list_prefabs` adds `packageInstalled` to each item.

The corpus describes every relevant component (PressableButton, Slider, Dialog, etc.) regardless of which MRTK packages happen to be in the connected project. End users hitting `mrtk3_describe_component({componentName: "PressableButton"})` get the same JSON whether their project uses the bleeding-edge MRTKDevTemplate (all 14 packages) or a minimal `dev-environment-mrtk3` (no uxcomponents). The `packageInstalled` flag tells them what they're missing.

### How to add a new component rule

1. Pick a clear, kebab-case file name under `Editor/Mrtk3Knowledge/` matching the component (e.g. `near-menu.yaml`).
2. Author the YAML against the schema in spec v2 §"Schema (per component file)". Required for `kind: component`: `schemaVersion`, `id`, `kind`, `name`, `namespace`, `package`, `sourceFile`, `purpose`. Use `referenceUsage` (prose list) to capture how MRTK's authors used the component in their internal sample scenes — **don't cite scene file paths**, those scenes ship only with MRTKDevTemplate, not with end-user UPM installs.
3. Cross-reference: every component should list 1-3 `relatedRules` ids; every decision rule should be heavily cross-referenced from the components it decides between.
4. Trigger validation: drop any-content sentinel `Editor/Mrtk3Knowledge/Fixtures/.corpus-runonce`, focus Unity, watch the console. The `Tools/UnityMCP/Validate Mrtk3 Knowledge Corpus` menu does the same one-click. Expect:
   ```
   [UnityMCP] <your-file>.yaml: 0 errors.
   [UnityMCP] Corpus validation complete: <N>/<N> entries passed; prefabs count=<P> categories=<C> pathErrors=0.
   ```
5. Round-trip via the tool surface: `mrtk3_describe_component({componentName: "<YourComponent>"})` should return your JSON with `relatedRules` expanded one hop.

### How corpus errors surface

- `Mrtk3KnowledgeCorpus.Load()` runs `Mrtk3KnowledgeValidator.Validate` per file; problems emit `[UnityMCP] mrtk3 corpus error in <file>: <msg>` warnings.
- The offending file is **excluded** from the live corpus (its id index won't have it).
- Tool envelopes include `corpusErrors: <int>` whenever the count is non-zero — agents see the number directly.
- `Tools/UnityMCP/Validate Mrtk3 Knowledge Corpus` menu (or sentinel `Fixtures/.corpus-runonce`) gives a verbose per-file breakdown.
- `Tools/UnityMCP/Validate Mrtk3 Knowledge Fixtures` menu (or sentinel `Fixtures/.validator-runonce`) re-runs the negative-test fixtures so you can confirm the validator's error paths still fire correctly.

### Prefab catalog — `prefabs.yaml`

Single-file curated catalog (≥30 entries / ≥6 categories required). Filter semantics:
- Omitted `category` or `canvas` → no filter on that axis.
- `"all"` is accepted as an alias for "no filter" on either axis.
- `"both"` is accepted as an alias for `canvas` (both canvas and non-canvas).

To add a prefab: append a row to `prefabs.yaml`, keep `(package, path)` package-relative, run the corpus validator. Categories used today: `button`, `slider`, `dialog`, `handmenu`, `panel`, `toggle`. Add new categories freely — `mrtk3_list_prefabs({category: "<your-cat>"})` will start matching as soon as the corpus reloads.

### Don't reference app-layer sample scenes

MRTKDevTemplate's `Assets/Scenes/CanvasUITearsheet.unity`, `NonCanvasUITearSheet.unity`, etc. live in the dev template's project, not in any UPM package. End users installing MRTK won't have them. The corpus describes patterns observed in those scenes via the `referenceUsage` prose list — **do not put scene file paths in any field**. The validator doesn't have a check for this (it only validates `(package, path)` records), so this is a discipline rule, not a tool-enforced one.

## UI authoring tools

UI authoring at canvas-property granularity used to take ~80–150 atomic property writes per panel. The tools below compress that into ~5–20 calls per panel by exposing macros + composite factories at the level the agent actually thinks in ("make this stretch", "create a text element with center alignment") rather than the level the SerializedObject API exposes.

### `ui_set_rect` — 11 RectTransform presets

One call replaces 5–6 property writes. Input: `{ rectTransformInstanceId, preset, params }`. The 11 presets:

| preset | required params | optional params | result (anchorMin / anchorMax / pivot / sizeDelta / anchoredPos) |
| --- | --- | --- | --- |
| `stretch` | — | `padding` (number or `{l,t,r,b}`) | (0,0) / (1,1) / (0.5,0.5) / (0,0) / (0,0); padding writes offsetMin/Max |
| `top-stretch` | `height` | `padding` (uniform horizontal) | (0,1) / (1,1) / (0.5,1) / (0, height) / (0,0) |
| `bottom-stretch` | `height` | — | (0,0) / (1,0) / (0.5,0) / (0, height) / (0,0) |
| `left-stretch` | `width` | — | (0,0) / (0,1) / (0, 0.5) / (width, 0) / (0,0) |
| `right-stretch` | `width` | — | (1,0) / (1,1) / (1, 0.5) / (width, 0) / (0,0) |
| `top-left` | `width`, `height` | `offsetX`, `offsetY` | (0,1) / (0,1) / (0,1) / (w,h) / (offsetX, -offsetY) |
| `top-right` | `width`, `height` | `offsetX`, `offsetY` | (1,1) / (1,1) / (1,1) / (w,h) / (-offsetX, -offsetY) |
| `bottom-left` | `width`, `height` | `offsetX`, `offsetY` | (0,0) / (0,0) / (0,0) / (w,h) / (offsetX, offsetY) |
| `bottom-right` | `width`, `height` | `offsetX`, `offsetY` | (1,0) / (1,0) / (1,0) / (w,h) / (-offsetX, offsetY) |
| `center` | `width`, `height` | — | (0.5,0.5) / (0.5,0.5) / (0.5,0.5) / (w,h) / (0,0) |
| `fill-axis` | `axis: "x"\|"y"`, `size` | — | axis=x → (0,0.5)/(1,0.5)/(0.5,0.5)/(0,size)/(0,0); axis=y → (0.5,0)/(0.5,1)/(0.5,0.5)/(size,0)/(0,0) |

Output is a normalized echo of the resulting rect — the agent can verify visually without a follow-up `go_serialize` call.

**Sign conventions for the four corner presets** are spec-table-verbatim: `top-*` push DOWN with negative-y, `bottom-*` push UP with positive-y, `*-right` push LEFT with negative-x, `*-left` push RIGHT with positive-x.

If a preset's required params are missing, the tool errors with `InvalidInput` naming the missing param. Unknown presets / unknown `fill-axis` axis values → `InvalidInput`. Wrong-type instanceId → `InvalidInput`.

Wrapped in `Undo.RecordObject` → single Ctrl-Z step per call.

### `ui_create_canvas` — Canvas factory with `world-mrtk` preset

Creates one GameObject with RectTransform + Canvas + CanvasScaler + GraphicRaycaster. Render modes:
- `screen-overlay` — ScreenSpaceOverlay
- `screen-camera` — ScreenSpaceCamera (caller assigns `worldCamera` via `component_set_property` afterwards if needed)
- `world` — WorldSpace, no scale change
- `world-mrtk` — WorldSpace + `localScale = (0.001, 0.001, 0.001)` + `sizeDelta` from optional `sizeMm` param. This is the MRTK 3 world-space convention, implemented as a generic preset (no MRTK package dependency).

Scaler param: `constant-pixel-size` / `scale-with-screen-size` / `constant-physical-size` / null. `parentInstanceId`: GameObject to nest under, null = scene root.

Output: `{ instanceId, rectTransformInstanceId, canvasInstanceId, scalerInstanceId, graphicRaycasterInstanceId, renderMode }`.

### `ui_create_text` — TextMeshProUGUI factory

Creates RectTransform + TextMeshProUGUI under `parentInstanceId`. TMP types are resolved via reflection (`Type.GetType("TMPro.TextMeshProUGUI, Unity.TextMeshPro")`) to avoid a hard asmdef ref.

Required: `parentInstanceId`, `name`, `text`. Optional: `autosize` (bool), `alignment` (case-insensitive, dash/underscore-tolerant — `"top-left"` / `"TopLeft"` / `"topleft"` all map to `TextAlignmentOptions.TopLeft`), `color` (`[r,g,b,a]` in 0..1), `font` (TMP_FontAsset instanceId or asset path; defaults to `TMP_Settings.defaultFontAsset`), `layoutElement` (`{minWidth?, minHeight?, preferredWidth?, preferredHeight?, flexibleWidth?, flexibleHeight?}`).

**TMP-not-initialized guard**: if `TMP_Settings.defaultFontAsset` is null AND no `font` was supplied, the tool fails fast with `InvalidInput` pointing at "Window/TextMeshPro/Import TMP Essential Resources".

Output: `{ instanceId, rectTransformInstanceId, textComponentInstanceId, layoutElementInstanceId? }`.

### `ui_create_image` — UGUI Image factory

Creates RectTransform + UnityEngine.UI.Image. Required: `parentInstanceId`, `name`. Optional: `sprite` (instanceId or asset path), `color`, `type` (`simple` / `sliced` / `tiled` / `filled`), `layoutElement`.

Output: `{ instanceId, rectTransformInstanceId, imageInstanceId, layoutElementInstanceId? }`.

### `ui_create_layout_group` — Vertical / Horizontal / Grid LayoutGroup factory

`type` selects: `vertical` / `horizontal` / `grid`. Optional: `padding` (number or `{l,t,r,b}`), `spacing` (uniform — grid expands to Vector2), `childAlignment` (TextAnchor enum, dash-tolerant), `controlChild` (`{width?, height?, expandWidth?, expandHeight?, scaleWidth?, scaleHeight?}` — vertical/horizontal only), `cellSize` (`[w,h]` — grid-only; passing with vertical/horizontal returns `InvalidInput`).

Flags that don't apply to the chosen type are silently ignored.

Output: `{ instanceId, rectTransformInstanceId, layoutGroupInstanceId, type }`.

### `component_set_properties` — transactional batch property writes

Sibling to the singular `component_set_property`. Sets N properties in one tool call with all-or-nothing semantics. Input: `{ componentInstanceId, writes: [{propertyPath, value}, ...] }`. Aliases (`position` / `rotation` / `scale` / `name` / `tag`) and value coercion (Vector*/Color/Quaternion arrays, enum string names, instanceId integers) are the same as the singular tool.

**Transactional model**: one `SerializedObject` wraps the target for the whole batch. Writes stage pending changes; `ApplyModifiedProperties` runs ONCE at the end of the successful batch — that's what produces the single Undo entry. On any per-write failure, the SerializedObject is disposed without calling Apply; Unity discards the pending changes automatically. No `Undo.RevertAllInCurrentGroup` needed.

**Failed-at reporting**: errors return `code: 'InvalidInput'` plus a `details.failedAt = '<propertyPath>'` field. The MCP server's error envelope surfaces `ToolException.Details` as a JSON-encoded `Details: { ... }` line appended to the message text (single text block; line 1 = `Error [code]: message`, line 2 = `Details: { ... }` when details are present). Callers recover the structured payload via `/^Details: (\{.*\})$/m` + `JSON.parse(match[1])`. Any tool throwing `ToolException(code, msg, details)` automatically gets this surface — no per-tool workaround needed.

Empty `writes` array → `InvalidInput`.

### `execute_menu_item` — `createdInstanceIds` for menu-driven creation

`execute_menu_item` now always returns a `createdInstanceIds` array. Detection is a `Selection.activeGameObject` diff before/after the menu invocation; if the active GameObject changed to one that didn't exist before, its instanceId surfaces.

**Works**: `GameObject/Create Empty`, `GameObject/3D Object/*`, `GameObject/2D Object/*` — menus that auto-select the new object in the canonical Unity flow.

**Doesn't fire**: `GameObject/UI/*` menus — these need the Editor's Hierarchy or Scene view focused to actually create the GameObject (`executed` returns false when invoked via the HTTP bridge headlessly). For UI element creation, use the composite tools (`ui_create_canvas`, `ui_create_text`, `ui_create_image`, `ui_create_layout_group`) — they don't depend on Editor focus.

**Doesn't fire**: window toggles (`Window/Package Manager`), validator/non-creator menus. `createdInstanceIds: []` is returned — agents treat empty as "nothing to clean up."

The field is always present, so callers can branch on `createdInstanceIds.length` without optional-chaining.

## Procedure runner

`procedure_run` reads a JSONC procedure file and replays its sequence of MCP tool calls. Use it to make multi-step authoring reproducible across sessions — once you've built a panel via macros in a conversation, capture that sequence as a procedure and a future session can rebuild from scratch via one `procedure_run` call.

The tool is **server-side** (not Editor-side) — it lives in `mcps/unity/server/src/procedure-runner.ts`, not in the Unity-package's Editor folder. It surfaces in `tools/list` alongside the Editor tools.

### File schema (JSONC)

```jsonc
// Documentation~/build-procedures/test-hub-panel.jsonc
{
  "name": "test-hub-panel",                        // optional, label for logs
  "description": "Build the TestHub panel.",       // optional, narrative
  "steps": [
    {
      "step": "Create the canvas",                 // optional, per-step description
      "tool": "ui_create_canvas",                  // required, MCP tool name
      "params": {
        "name": "TestHubPanel",
        "renderMode": "world-mrtk",
        "sizeMm": [300, 200]
      },
      "captureOutputAs": "$canvas"                 // optional, $identifier
    },
    {
      "step": "Top bar — top-stretch, 30mm tall",
      "tool": "ui_create_image",
      "params": {
        "parentInstanceId": { "ref": "$canvas.instanceId" },   // resolves from earlier step
        "name": "TopBar"
      },
      "captureOutputAs": "$topbar"
    }
  ]
}
```

JSONC = JSON with comments. The server uses `jsonc-parser` (VS Code's parser) so `//` line comments and `/* ... */` block comments work above any step.

### Reference grammar

```
ref-expr := "$" identifier ("." identifier)*
identifier := [A-Za-z_][A-Za-z0-9_]*
```

- `{ "ref": "$canvas" }` — substitutes the whole captured output of the step that set `captureOutputAs: "$canvas"`.
- `{ "ref": "$canvas.instanceId" }` — dotted path into the captured object.
- `{ "ref": "$canvas.field.subfield" }` — multi-level paths work.
- `{ "ref": "$canvas[0]" }` — **NOT supported in v1.** Bracket indexing throws `UnresolvedRefError`. Workaround: have an earlier step `captureOutputAs` the array element directly.

A `{ ref }` record is recognized **only when** the object has exactly one key named `ref` AND the value is a string starting with `$`. User data with a `ref` key shaped differently is left alone.

### Calling the tool

```jsonc
// Input
{
  "path": "Documentation~/build-procedures/test-hub-panel.jsonc",
  "dryRun": false   // optional, default false
}
```

`path` is relative to the Unity project root (the directory containing `Assets/` and `Packages/`). Absolute paths are rejected. The `Documentation~/build-procedures/` convention is recommended — Unity ignores `Documentation~` folders (tilde suffix), so procedure files don't trigger asset import.

### Output shapes

**Happy path:**

```jsonc
{
  "ok": true,
  "procedureName": "test-hub-panel",
  "totalSteps": 3,
  "executed": 3,
  "steps": [
    { "stepIndex": 0, "step": "Create the canvas", "tool": "ui_create_canvas", "params": {...post-resolution}, "result": {...}, "durationMs": 107 },
    ...
  ],
  "capturedVars": {
    "$canvas": { "instanceId": 1234, ... },
    "$topbar": { "instanceId": 1240, ... }
  }
}
```

Each step's logged `params` is the **post-resolution** form so the operator sees the actual values that hit the tool.

**dryRun:** same shape as the happy path but with `dryRun: true` and no tool calls. Steps log `refsResolved: { "$canvas.instanceId": "<would resolve from $canvas at runtime>" }` — refs are structurally validated against the declared-vars set (every `$varName` must appear as an earlier `captureOutputAs`) but values aren't synthesized. Use to catch typos before running.

**Per-step failure:**

```jsonc
// isError: true; text content is "Error [ToolError]: Step 2 (ui_set_rect) failed: ...\nDetails: { ... }"
{
  "failedAt": { "stepIndex": 2, "tool": "ui_set_rect", "error": "Error [InvalidInput]: ..." },
  "executed": 2,
  "totalSteps": 3,
  "procedureName": "test-hub-panel",
  "steps": [ /* steps 0 and 1 logs */ ],
  "capturedVars": { "$canvas": {...} }   // vars captured up to (but not including) the failed step
}
```

Stop-on-first-failure: steps after the failure index are NOT executed. `capturedVars` reflects state at the failure point. Recover via `/^Details: (\{.*\})$/m` + JSON.parse — same recipe as every other unity-mcp structured error (see "Failed-at reporting" earlier in this doc).

**Unresolved ref:**

```jsonc
// isError: true
{
  "unresolvedRef": "$missing.field",
  "stepIndex": 1
}
```

Variable not declared upstream, or path doesn't traverse, or intermediate value is null. `dryRun: true` also surfaces this (structurally, without firing tools).

### Authoring tip — the macro pairing

Procedures become readable because they call **high-level macros**, not raw property writes. A procedure built on `ui_create_canvas` / `ui_create_image` / `ui_set_rect` / `component_set_properties` (from the UI authoring slice) is 10-20 lines for a hub-panel-sized surface. A procedure built on `go_create` + `component_add` + N `component_set_property` calls would be 150+ lines. Macros are why procedure-as-data works.

### Limitations (v1)

- No bracket indexing in refs (`$a[0]`). Workaround: capture array elements individually upstream.
- No procedure discovery — caller passes the path. No globbing of `Documentation~/build-procedures/`, no virtual-tool registration.
- No rollback on failure. Procedures aren't transactional; the per-step log + `capturedVars` tell you what landed so you can clean up manually.
- No tool denylist/whitelist. Procedures can call any registered MCP tool. Security is the underlying tool's job.
- No concurrent procedure runs in v1 (no in-process lock). Two `procedure_run` calls in flight would interleave bridge calls. Sequence procedures from your driver if you need ordering.

## `playmode_set` — Play Mode control

Enter Play Mode, pause, or exit Play Mode with a **bounded await** on the transition. Lives at `Editor/Tools/Editor/PlaymodeSetTool.cs`. Input: `{ state: "play" | "paused" | "stopped", timeoutMs?: 1000–60000 (default 10000), saveDirtyScenes?: bool (default true) }`. Output: `{ previous, current, transitionMs }`. Full schema lives next to the tool source; see also the spec at `.claude/specs/unity-mcp-playmode-control/v1.md`.

The bounded await is the point of the tool — it returns *after* Unity has settled into the requested state. Idempotent: requesting the current state is a no-op that returns within a frame. On timeout the tool throws `ToolException("TransitionTimeout", Details: { requestedState, observedState, elapsedMs })` — parse via `/^Details: (\{.*\})$/m` on the response text.

Default `timeoutMs` is **10 000**, not the 300 000 used by `run_tests`. Play Mode transitions usually settle in 100–500ms; the 10s ceiling exists for cold-domain reload paths and gives the caller a predictable failure window. Bump it explicitly via `timeoutMs:` when entering Play Mode against a project that's about to recompile.

### Caveats

- **Play Mode Options → Reload Scene + `saveDirtyScenes: false`.** If the user has Edit → Project Settings → Editor → "Reload Scene" checked under Enter Play Mode Options, calling `playmode_set({ state: "play", saveDirtyScenes: false })` against a dirty scene can hang the Editor on the scene-reload modal. Workaround: leave `saveDirtyScenes` at its default `true`, or disable the Reload Scene option. The bounded await caps the damage but the tool will still surface as `TransitionTimeout`.
- **Concurrent calls aren't single-flighted in v1.** Two back-to-back `playmode_set` requests will both run; the second observes the first's intermediate state and either no-ops (if the first already settled into the target) or awaits naturally. Documented as a known minor race — if a real workflow surfaces a bug, add an in-process lock in the dispatcher.
- **`stopped → paused` enters play first, then pauses.** Unity has no API to enter Play Mode already paused; the tool sets `isPaused = true` *before* flipping `isPlaying = true` so Unity enters play already in the paused state. The tool returns once `(isPlaying, isPaused) == (true, true)`.

### Smoke harness

```
cd mcps/unity/server
npm run smoke:v2 -- --only Playmode --include-playmode-tests
```

Exercises the round-trip cases (play / paused / stopped), the idempotent no-op, and the dirty-scene auto-save. Add `--include-playmode-timeout-probe` to additionally exercise the forced-timeout envelope shape and the `saveDirtyScenes: false` path (both can leave the Editor mid-transition — opt in deliberately).

The transition mechanics (compile-wait pre-flight, dirty-scene save, the `isPlaying`/`isPaused` flips, the bounded yield-poll) live in `Editor/Tools/Editor/PlayModeTransition.cs`, **not** in the tool. `playmode_set` is a thin validate-and-describe wrapper, and `view_screen` reuses the same helper to enter play before capturing. If you change transition behavior, change it there once.

## `view_screen` — the true composited final frame

`view_screen` captures **what's actually on the player's screen** — post-processing, ScreenSpace-Overlay UI, and stacked cameras composited together — which is strictly more than any single-camera render can show. Lives at `Editor/Tools/Vision/ViewScreenTool.cs`. Two modes:

| mode | mechanism | post-FX | overlay UI | camera stack | poseable | needs Play Mode |
|---|---|---|---|---|---|---|
| `screen` (default) | `ScreenCapture.CaptureScreenshotAsTexture()` on the focused Game View | ✅ | ✅ | ✅ | ❌ | ✅ |
| `composite` | offscreen RT render of one camera (+ its post-FX) via `CameraCapture` | ✅ | ❌ | ❌ | ✅ (`cameraInstanceId`) | ❌ |

**Why `screen` is the only true "final frame":** ScreenSpace-**Overlay** canvases composite in the engine *after* every camera renders — no `camera.Render()` ever sees them. Only `ScreenCapture` reads the post-composite framebuffer. So for HUDs/menus drawn in Overlay mode (the common case), `screen` is mandatory; `composite` will silently omit them.

**Play-mode behavior (`screen`):** if the Editor is stopped (or paused), the tool enters Play Mode via `PlayModeTransition` (same save-then-bounded-await as `playmode_set`) and **stays in play**. The composited frame only exists while the player loop is rendering. After entering play it forces a few `QueuePlayerLoopUpdate` + Game View `Repaint` ticks and yields the dispatcher so `ScreenCapture` reads a *fresh* frame rather than the last stale one.

**Tool selection cheat-sheet:**
- One raw camera, no post-FX, cheapest → `view_game`.
- Arbitrary 6DoF viewpoint → `view_scene_from` / `view_scene_orbit`.
- VR headset view + hand/controller sidecar → `view_user_perspective`.
- **What the player literally sees on screen** → `view_screen` (`mode: "screen"`).
- A specific camera's render with post-FX, headless/poseable, UI-overlay not needed → `view_screen` (`mode: "composite"`, `cameraInstanceId`).

**Failure modes:**

| Symptom | Cause | Fix |
|---|---|---|
| `ToolError: ScreenCapture returned an empty frame` | Play Mode entered but no frame rendered yet, Game View not drawing, or a fully headless/`-batchmode` session with no real Game View surface | Confirm a Game View is visible and rendering; retry (the repaint ticks usually settle it). In `-batchmode` there is no composited surface — use `mode: "composite"` instead. |
| Black / single-color frame in `screen` mode | Game View tab is hidden behind another tab and not repainting | Bring the Game View tab to front. |
| Overlay UI missing | Called `composite` mode | Use `mode: "screen"`. |
