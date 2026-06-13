@tool
extends RefCounted
## Registers socket-surface tool handlers and advertises the full tool list
## (socket handlers + static CLI-tool descriptors) for the capability descriptor.
##
## v1 registers built-ins only. Adding a tool = add one preload + one register
## call here; the external server picks it up dynamically from the descriptor,
## with no TypeScript change (proves the v2 extension path).

const McpTool := preload("res://addons/claude_mcp/tools/mcp_tool.gd")

const ProjectInfoTool := preload("res://addons/claude_mcp/tools/project_info.gd")
const SceneInfoTool := preload("res://addons/claude_mcp/tools/scene_info.gd")
const NodeFindTool := preload("res://addons/claude_mcp/tools/node_find.gd")
const NodeCreateTool := preload("res://addons/claude_mcp/tools/node_create.gd")
const ViewTool := preload("res://addons/claude_mcp/tools/view.gd")

# ── v2 Bundle 1 — scene/node + settings (socket) ─────────────────────────────
const NodeDeleteTool := preload("res://addons/claude_mcp/tools/node_delete.gd")
const NodeReparentTool := preload("res://addons/claude_mcp/tools/node_reparent.gd")
const NodeSetPropertyTool := preload("res://addons/claude_mcp/tools/node_set_property.gd")
const NodeDuplicateTool := preload("res://addons/claude_mcp/tools/node_duplicate.gd")
const SceneCreateTool := preload("res://addons/claude_mcp/tools/scene_create.gd")
const SceneOpenTool := preload("res://addons/claude_mcp/tools/scene_open.gd")
const SceneSaveTool := preload("res://addons/claude_mcp/tools/scene_save.gd")
const SceneReloadTool := preload("res://addons/claude_mcp/tools/scene_reload.gd")
const ScriptCreateTool := preload("res://addons/claude_mcp/tools/script_create.gd")
const ScriptEditTool := preload("res://addons/claude_mcp/tools/script_edit.gd")
const ScriptAttachTool := preload("res://addons/claude_mcp/tools/script_attach.gd")
const ScriptValidateTool := preload("res://addons/claude_mcp/tools/script_validate.gd")
const ProjectSettingsGetTool := preload("res://addons/claude_mcp/tools/project_settings_get.gd")
const ProjectSettingsSetTool := preload("res://addons/claude_mcp/tools/project_settings_set.gd")
const InputMapListTool := preload("res://addons/claude_mcp/tools/input_map_list.gd")
const InputMapAddTool := preload("res://addons/claude_mcp/tools/input_map_add.gd")
const InputMapRemoveTool := preload("res://addons/claude_mcp/tools/input_map_remove.gd")

# ── v2 Bundle 3 — Game UI / Control nodes (socket) ───────────────────────────
const UiCreateControlTool := preload("res://addons/claude_mcp/tools/ui_create_control.gd")
const UiInspectControlTool := preload("res://addons/claude_mcp/tools/ui_inspect_control.gd")
const UiSetAnchorsTool := preload("res://addons/claude_mcp/tools/ui_set_anchors.gd")
const UiGetThemeTool := preload("res://addons/claude_mcp/tools/ui_get_theme.gd")
const UiSetThemeOverrideTool := preload("res://addons/claude_mcp/tools/ui_set_theme_override.gd")
const UiSetContainerLayoutTool := preload("res://addons/claude_mcp/tools/ui_set_container_layout.gd")

# ── v2 Bundle 4 — runtime introspection (debugger channel) ───────────────────
const PlaySceneTool := preload("res://addons/claude_mcp/tools/play_scene.gd")
const StopSceneTool := preload("res://addons/claude_mcp/tools/stop_scene.gd")
const RuntimeTreeTool := preload("res://addons/claude_mcp/tools/runtime_tree.gd")
const RuntimeGetPropertyTool := preload("res://addons/claude_mcp/tools/runtime_get_property.gd")
const RuntimeSetPropertyTool := preload("res://addons/claude_mcp/tools/runtime_set_property.gd")
const RuntimeEmitSignalTool := preload("res://addons/claude_mcp/tools/runtime_emit_signal.gd")
const RuntimeInjectInputTool := preload("res://addons/claude_mcp/tools/runtime_inject_input.gd")

# ── content-pipeline bundle — asset / resource / scene pipeline (socket) ─────────
const ImportAssetTool := preload("res://addons/claude_mcp/tools/import_asset.gd")
const SetResourceTool := preload("res://addons/claude_mcp/tools/set_resource.gd")
const InstanceSceneTool := preload("res://addons/claude_mcp/tools/instance_scene.gd")
const CreateResourceTool := preload("res://addons/claude_mcp/tools/create_resource.gd")

var _handlers: Dictionary = {} # name -> McpTool


func register_builtins() -> void:
	_register(ProjectInfoTool.new())
	_register(SceneInfoTool.new())
	_register(NodeFindTool.new())
	_register(NodeCreateTool.new())
	_register(ViewTool.new())
	# v2 Bundle 1 — scene/node + settings
	_register(NodeDeleteTool.new())
	_register(NodeReparentTool.new())
	_register(NodeSetPropertyTool.new())
	_register(NodeDuplicateTool.new())
	_register(SceneCreateTool.new())
	_register(SceneOpenTool.new())
	_register(SceneSaveTool.new())
	_register(SceneReloadTool.new())
	_register(ScriptCreateTool.new())
	_register(ScriptEditTool.new())
	_register(ScriptAttachTool.new())
	_register(ScriptValidateTool.new())
	_register(ProjectSettingsGetTool.new())
	_register(ProjectSettingsSetTool.new())
	_register(InputMapListTool.new())
	_register(InputMapAddTool.new())
	_register(InputMapRemoveTool.new())
	# v2 Bundle 3 — Game UI / Control nodes
	_register(UiCreateControlTool.new())
	_register(UiInspectControlTool.new())
	_register(UiSetAnchorsTool.new())
	_register(UiGetThemeTool.new())
	_register(UiSetThemeOverrideTool.new())
	_register(UiSetContainerLayoutTool.new())
	# v2 Bundle 4 — runtime introspection
	_register(PlaySceneTool.new())
	_register(StopSceneTool.new())
	_register(RuntimeTreeTool.new())
	_register(RuntimeGetPropertyTool.new())
	_register(RuntimeSetPropertyTool.new())
	_register(RuntimeEmitSignalTool.new())
	_register(RuntimeInjectInputTool.new())
	# content-pipeline bundle — asset / resource / scene pipeline
	_register(ImportAssetTool.new())
	_register(SetResourceTool.new())
	_register(InstanceSceneTool.new())
	_register(CreateResourceTool.new())


func _register(tool: McpTool) -> void:
	_handlers[tool.tool_name()] = tool


func has(name: String) -> bool:
	return _handlers.has(name)


func get_handler(name: String) -> McpTool:
	return _handlers.get(name)


const Identity := preload("res://addons/claude_mcp/capabilities/project_identity.gd")


## CLI tools have no in-editor handler — they execute in the external server.
## They are advertised here so the descriptor describes the whole surface.
## dotnet_build is gated on a C# project (descriptor-driven conditional surface).
func _cli_descriptors() -> Array:
	var descriptors: Array = [
		{
			"name": "run_project",
			"description": "Launch the project via the headless godot binary (non-blocking). Returns a launch acknowledgment; read output with get_debug_output.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"windowed": {"type": "boolean", "description": "Run with a visible window instead of headless."},
					"scene": {"type": "string", "description": "Optional res:// path of a specific scene to run."}
				}
			},
			"surface": "cli",
		},
		{
			"name": "get_debug_output",
			"description": "Return accumulated stdout/stderr from the most recent run_project launch, plus status (running/exited) and exit code.",
			"inputSchema": {"type": "object", "properties": {}},
			"surface": "cli",
		},
		{
			"name": "export_preset",
			"description": "Build/export the project for a configured export preset via the headless binary (--export-release / --export-debug). Waits for completion; returns the artifact path + exit code. A misconfigured preset returns a structured error, never a hang.",
			"inputSchema": {
				"type": "object",
				"required": ["preset"],
				"properties": {
					"preset": {"type": "string", "description": "Export preset name as configured in the project's export settings."},
					"outputPath": {"type": "string", "description": "Optional output artifact path. Defaults to the preset's configured path."},
					"debug": {"type": "boolean", "description": "Export a debug build (--export-debug) instead of release."}
				}
			},
			"surface": "cli",
		},
	]
	# C#-only: surface dotnet_build only when this is a C# project, proving the
	# descriptor drives the conditional tool surface (no TypeScript change).
	if Identity.language() == "csharp":
		descriptors.append({
			"name": "dotnet_build",
			"description": "Compile the C# Godot project via 'dotnet build'. Returns structured {success, errors[{file,line,message}], warnings} parsed from the build output. C# projects only.",
			"inputSchema": {"type": "object", "properties": {}},
			"surface": "cli",
		})
	return descriptors


## Full advertised tool list: socket handlers + CLI descriptors.
func describe_tools() -> Array:
	var out: Array = []
	for name in _handlers:
		var tool: McpTool = _handlers[name]
		out.append({
			"name": tool.tool_name(),
			"description": tool.description(),
			"inputSchema": tool.input_schema(),
			"surface": tool.surface(),
		})
	out.append_array(_cli_descriptors())
	return out
