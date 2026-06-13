# Godot MCP

An MCP server that lets an AI agent (Claude Code, Cursor, …) drive the **Godot 4.x editor** — read live scene state, mutate the scene tree (undoably), capture the viewport, and run the project headlessly with captured output.

Two processes:

- **MCP server** (TypeScript, `server/`) — runs on stdio as a child of the MCP client. Talks to the live editor over a local WebSocket, and shells the `godot` binary for headless runs.
- **Editor plugin** (GDScript, `godot-plugin/addons/claude_mcp/`) — installed into a Godot project's `addons/`. Boots on enable, hosts the WebSocket bridge, dispatches tool calls on the editor main thread.

The plugin host is GDScript by design (it survives C# assembly reloads); it drives **both GDScript and C#/.NET projects**.

---

## v1 tool surface

Seven tools across two surfaces (all appear as one `mcp__GodotMCP__*` list):

| Tool | Surface | What it does |
|---|---|---|
| `project_info` | socket | Capability descriptor: Godot version, language (gdscript/csharp), render method, paths, binary path. |
| `scene_info` | socket | Active scene name/path, root node name+type, child count. |
| `node_find` | socket | Find a node by name or path; returns path/type/transform. |
| `node_create` | socket | Create a node of a class under a parent — **undoable in one Ctrl+Z**. |
| `view` | socket | Capture the editor 2D or 3D viewport as a PNG the agent can see. |
| `run_project` | CLI | Launch the project via `godot --headless` (non-blocking). |
| `get_debug_output` | CLI | Read accumulated stdout/stderr + status from the last `run_project`. |

The server registers tools **dynamically** from the plugin's capability descriptor — it hardcodes no tool names. Adding a GDScript tool handler makes it appear in the MCP surface with no server change.

---

## v2 tool surface (additive)

v2 adds four bundles **on the same architecture** (no new transport/envelope/threading — every socket tool is a new GDScript handler the server picks up dynamically, every CLI tool a new server entry). The surface grows from 7 to ~35 tools (~36 on a C# project); the [content-pipeline bundle](#content-pipeline-bundle-additive) below takes it to 42. v1's seven tools are unchanged.

**Bundle 1 — scene/node + settings (socket):**
`node_delete`, `node_reparent`, `node_set_property`, `node_duplicate` (all undo-wrapped); `scene_create`, `scene_open`, `scene_save`, `scene_reload`; `script_create`, `script_attach`, `script_validate`; `project_settings_get`/`set`, `input_map_list`/`add`/`remove`.

**Bundle 2 — build / export + C# (CLI):**
`export_preset` (drives `--export-release`/`--export-debug`, returns artifact + exit code, structured error on misconfig — never hangs); `dotnet_build` (C# projects only — runs `dotnet build`, returns `{success, errors:[{file,line,message}], warnings}`). `dotnet_build` is advertised only when the project is C#.

**Bundle 3 — Game UI / Control nodes (socket):**
`ui_create_control` (anchor-preset-aware, undo-wrapped), `ui_inspect_control` (anchors/offsets/size/theme), `ui_set_anchors`, `ui_get_theme`, `ui_set_theme_override`, `ui_set_container_layout`.

**Bundle 4 — runtime introspection (debugger channel):**
`runtime_tree`, `runtime_get_property`, `runtime_set_property`, `runtime_emit_signal` — inspect and modify the **live running game** over Godot's `EngineDebugger` capture channel (not a debugger-wire reimplementation). These require a game launched from the editor (a live debugger session) and an injected autoload (`McpRuntimeEndpoint`, added to the project while the plugin is enabled).

> **Removing the runtime autoload.** The plugin adds `McpRuntimeEndpoint` as a project autoload so the running game carries the runtime endpoint. It no-ops outside an editor debug session, so it is left in place on plugin disable (removing it would churn `project.godot` on every toggle). To remove it manually: **Project → Project Settings → Autoload → McpRuntimeEndpoint → Remove**.

**Value coercion.** `node_set_property`, the theme tools, the content-pipeline setters, and `runtime_set_property` coerce JSON values to Godot Variants for common types (primitives, `Vector2/3`(`i`), `Color` via hex/name/array, `Rect2`(`i`), `NodePath`, `res://` `Resource`/`StyleBox`, inline flat StyleBox). Unsupported types return a structured `InvalidInput` naming the type — never a silent wrong value.

---

## Content-pipeline bundle (additive)

Four more socket tools on the same descriptor-driven architecture (no TypeScript change — the server picks them up from the plugin's capability descriptor). The surface grows to **42 tools** (43 on a C# project). These close the "author and wire up content, not just nodes" gap.

- **`import_asset`** — copy an image from a drop folder into `res://` and drive the editor import so it loads as a `Texture2D`. Reimport is deferred in Godot 4.6 (a bare `scan()` + `reimport_files()` collides re-entrantly), so the handler is a coroutine that awaits via `update_file` + a bounded frame poll. Rejects non-image extensions with a structured `InvalidInput`.
- **`set_resource`** — build a `Texture2D` / `AtlasTexture` (region `Rect2`) / `StyleBoxTexture` and assign it to a node property, undo-wrapped (single Ctrl+Z).
- **`instance_scene`** — instance a saved `.tscn` (`PackedScene`) into the active scene as one undoable node, persisted as an instance reference; rejects self-instancing cycles.
- **`create_resource`** — author a custom `Resource` `.tres` (script class + fields), round-trips via `load()`; returns a structured "build first" error for an unbuilt C# resource class.

This bundle also landed two tools authored in an earlier session but not previously checked in — **`script_edit`** (now using the shared `_PROTECTED_PREFIX` guard) and **`stop_scene`** — plus a `copy_binary_file` helper (binary sibling of `write_text_file`).

---

## Install

### 1. Build the server

```bash
cd mcps/godot/server
npm install
npm run build        # produces build/index.js
```

### 2. Install the plugin into a Godot project

Copy (or symlink) the addon into your project's `addons/` directory:

```
<your-project>/addons/claude_mcp/   ←   mcps/godot/godot-plugin/addons/claude_mcp/
```

Then enable it in Godot: **Project → Project Settings → Plugins → Claude MCP Bridge → Enable**.

On enable you should see in the **Output** panel:

```
[claude_mcp] bridge up on 127.0.0.1:<port>
```

The plugin writes `~/.claude/godot-mcp/instances/<projectId>.json` with the port and **this editor's own binary path** — that's how the server finds both the socket and the `godot` binary (which need not be on `PATH`).

### 3. Register the MCP server with Claude Code

```bash
claude mcp add --transport stdio --scope user GodotMCP node <abs-path>/mcps/godot/server/build/index.js
```

Restart the Claude Code session (MCP tool schemas load at session start). Verify:

```bash
claude mcp list      # GodotMCP: ✓ Connected
```

---

## Notes

- **The `godot` binary** is resolved in this order: the plugin-written `binaryPath` in the registry (the running editor's own exe) → `GODOT_BIN` env var → `godot` on `PATH`. If none resolves, CLI tools return `GodotBinaryNotFound` (socket tools are unaffected).
- **Windows stdout capture:** the `_console.exe` variant of the Godot binary attaches stdout reliably. `run_project` captures output from whichever binary the registry reports.
- **`view` needs a windowed editor.** A `--headless` editor has no rendering surface; `view` returns a clear error there. Run the editor with a window to capture the viewport.
- **One editor at a time (v1).** The registry format supports multiple editors, but the server picks the first live instance. Stale entries (dead PID) are pruned automatically.
- **No reload-survival dance.** The GDScript bridge stays up across script edits and across C# project rebuilds — it does not need the restart logic a C#-hosted plugin would.

## Beyond v1

**Shipped in v2 / the content-pipeline bundle:** runtime introspection, `export_preset`, C# build orchestration (`dotnet_build`), Game-UI / Control tools, and the content pipeline (`import_asset` / `set_resource` / `instance_scene` / `create_resource`).

**Still pending (v3):** XR/OpenXR tools, test runners (GUT / GdUnit4), multi-instance routing, two-way push (editor → MCP), `view_scene_from(pose)` 6DoF capture.

## License

MIT. Clean-room from `tugcantopaloglu/godot-mcp` and `hi-godot/godot-ai` — read for architectural shape, written independently, credited.
