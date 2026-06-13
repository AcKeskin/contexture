# Unity MCP

A custom [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent (Claude Code, Cursor, VSCode) drive the **Unity Editor** — read scene state, mutate the asset database, manipulate GameObjects, author UI, inspect XR/MRTK3 components, and *see* the editor through rendered captures.

> **For LLMs reading this repo:** this is a two-process MCP. The TypeScript server in [`server/`](./server/) is a thin protocol shim; **all tools live on the Unity side** in [`unity-package/`](./unity-package/) and are advertised dynamically from a capability descriptor. Do not look for tool implementations in `server/` — look in `unity-package/Editor/Tools/`. Start with [`CONTRIBUTING-DEBUG.md`](./CONTRIBUTING-DEBUG.md) for how to run, trace, and diagnose it.

## How it works

```
┌──────────────┐   stdio (MCP)   ┌──────────────┐   HTTP    ┌──────────────────┐
│  MCP Client  │ ◄─────────────► │  MCP Server  │ ◄───────► │  Unity Editor    │
│ (Claude Code)│                 │ (TypeScript) │           │  (C# package)    │
└──────────────┘                 └──────────────┘           └──────────────────┘
```

- **MCP server** (`server/`, TypeScript) — runs as a child of the MCP client on stdio. Discovers the running Editor via a registry file and forwards each tool call over local HTTP. It hardcodes no tool names; it fetches the tool list from the Editor's `/capabilities` endpoint.
- **Unity package** (`unity-package/`, C#) — installed into a Unity project. On `[InitializeOnLoad]` it starts an `HttpListener` on `127.0.0.1:<port>`, registers itself in `~/.claude/unity-mcp/instances/`, discovers tools by reflection, and dispatches each call onto the Editor main thread.

Because the surface lives on the Editor side and is advertised dynamically, adding a tool never requires a server release — and tools gate themselves on detected capabilities (XRI / MRTK3 tools only appear when those packages are present).

## Tool surface

~70 typed tools across ~15 domains. snake_case names, domain-prefixed.

| Domain | Examples |
|---|---|
| **Project / scene** | `project_info`, `scene_info`, `scene_load`, `scene_save`, `scene_create`, `scene_set_active` |
| **GameObject** | `go_create`, `go_find`, `go_delete`, `go_set_transform`, `go_set_parent`, `go_set_active`, `go_serialize` |
| **Component** | `component_add`, `component_remove`, `component_list`, `component_describe`, `component_set_property`, `component_set_properties` |
| **Asset / prefab** | `asset_create`, `asset_find`, `asset_import`, `asset_delete`, `asset_get_dependencies`, `prefab_create_from`, `prefab_instantiate`, `prefab_apply_overrides`, `prefab_revert` |
| **Material / physics / settings** | `manage_material`, `manage_physics`, `manage_project_settings`, `manage_packages`, `manage_camera` |
| **UI authoring** | `ui_create_canvas`, `ui_create_text`, `ui_create_image`, `ui_create_layout_group`, `ui_set_rect` |
| **Scripts** | `manage_script`, `script_apply_edits`, `find_in_file` |
| **Editor / input / tests** | `execute_menu_item`, `playmode_set`, `manage_input`, `input_inject`, `run_tests`, `console_read`, `unity_reflect`, `unity_docs` |
| **Vision** | `view_game`, `view_screen` (true composited final frame — post-FX + overlay UI), `view_scene_from`, `view_scene_orbit`, `view_inspector_preview`, `view_xr_simulator`, `view_user_perspective` — return PNG the agent actually sees |
| **XR (XRI)** | `xri_get_rig`, `xri_inspect_interactor`, `xri_inspect_interactable`, `xri_get_input_actions`, `xri_simulate_pose`, `xri_inject_device` — gated on XRI |
| **Spatial UI (MRTK 3)** | `mrtk3_list_uxcomponents`, `mrtk3_inspect_button`/`_handmenu`/`_slider`/…, `mrtk3_validate_component`, `mrtk3_describe_component`, `mrtk3_list_prefabs` — gated on MRTK 3 |
| **Procedures** | `procedure_run` — replay a JSONC sequence of tool calls (server-side) |

The vision tools return image content natively, so the agent *sees* the scene rather than a path to a screenshot. The MRTK3 tools pair structural inspection with a curated knowledge corpus (`unity-package/Editor/Mrtk3Knowledge/`) that answers *when / why / how* to use a component.

## Install

You need Node 18+ and a Unity project (2021.3 LTS or newer).

**1. Build the server.**

```bash
cd mcps/unity/server
npm install
npm run build
```

**2. Add the Unity package** to your project's `Packages/manifest.json` as a local reference:

```jsonc
{
  "dependencies": {
    "com.ackeskin.unity-mcp": "file:../../contexture/mcps/unity/unity-package"
    // adjust the relative path to wherever this repo lives
  }
}
```

Open Unity. The package auto-starts on load — the console logs `[UnityMCP] boot complete on port <port>, <N> tools registered.`

**3. Register the MCP server** with your client. For Claude Code, in `~/.claude.json`:

```jsonc
{
  "mcpServers": {
    "UnityMCP": {
      "command": "node",
      "args": ["<abs-path>/contexture/mcps/unity/server/build/index.js"]
    }
  }
}
```

Restart the client. With Unity open, the tool list populates from the live capability descriptor. If `tools/list` is empty, confirm Unity is running and a registry file exists under `~/.claude/unity-mcp/instances/` — see [`CONTRIBUTING-DEBUG.md`](./CONTRIBUTING-DEBUG.md) for the full troubleshooting table.

## Verify

```bash
cd mcps/unity/server
npm run smoke:v2        # round-trips tools across all domains against the open Editor
```

## Layout

| Path | What |
|---|---|

| [`CONTRIBUTING-DEBUG.md`](./CONTRIBUTING-DEBUG.md) | Run / trace / diagnose; per-subsystem operator reference |

| [`server/`](./server/) | TypeScript MCP server (bridge, registry discovery, procedure runner) |
| [`unity-package/`](./unity-package/) | Unity Editor package — `Editor/Tools/` is the tool surface |

## License

MIT. Clean-room from [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) — read for architectural reference, code is original. Credit where due.
