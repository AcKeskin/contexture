@tool
extends EditorPlugin
## Claude MCP Bridge — entry point.
##
## Boots on plugin enable / project load (`_enter_tree`). Starts the WebSocket
## bridge on an OS-assigned 127.0.0.1 port, registers tool handlers, builds the
## capability descriptor, and writes the instance registry file so the external
## MCP server can discover the port + this editor's binary path.
##
## GDScript (not C#) by design: a long-lived socket server in a C# plugin gets
## torn down on every assembly reload. This host survives reloads and drives
## C# projects via EditorInterface like any other.

const RegistryWriter := preload("res://addons/claude_mcp/discovery/registry_writer.gd")
const BridgeSocketServer := preload("res://addons/claude_mcp/bridge/socket_server.gd")
const ToolRegistry := preload("res://addons/claude_mcp/tools/tool_registry.gd")
const RuntimeDebuggerPlugin := preload("res://addons/claude_mcp/runtime/runtime_debugger_plugin.gd")

## Autoload that the running game loads so its EngineDebugger endpoint comes up.
## Registered as a project autoload while the plugin is enabled; removed on disable.
const RUNTIME_AUTOLOAD_NAME := "McpRuntimeEndpoint"
const RUNTIME_AUTOLOAD_PATH := "res://addons/claude_mcp/runtime/game_debugger_endpoint.gd"

var _registry_writer: RegistryWriter
var _socket_server: BridgeSocketServer
var _tool_registry: ToolRegistry
var _runtime_debugger: RuntimeDebuggerPlugin


func _enter_tree() -> void:
	_tool_registry = ToolRegistry.new()
	_tool_registry.register_builtins()

	# Bundle 4 runtime channel: register the editor-side debugger plugin and ensure
	# the running game loads the in-game endpoint autoload. EngineDebugger is only
	# active in an editor-launched run, so this is a no-op for exported builds.
	_runtime_debugger = RuntimeDebuggerPlugin.new()
	add_debugger_plugin(_runtime_debugger)
	_ensure_runtime_autoload()

	_socket_server = BridgeSocketServer.new()
	add_child(_socket_server) # so _process() ticks on the editor main loop
	# Pass the runtime debugger so runtime_* tools can reach the live game.
	_socket_server.configure(_tool_registry, self, _runtime_debugger)
	var port := _socket_server.start()

	# Publish the instance descriptor ONLY from a real interactive editor.
	# A `--headless` invocation (export_preset's `--export-release`, a headless
	# run_project) still loads this EditorPlugin far enough to run _enter_tree,
	# and would otherwise overwrite — then, on its _exit_tree, erase() — the
	# live editor's per-project registry file, knocking the editor offline.
	# The registry key is per-project (project_identity.project_id()), so a
	# transient headless child shares the editor's file path. Guarding on a
	# non-headless DisplayServer keeps the registry owned solely by the editor.
	if _is_interactive_editor():
		_registry_writer = RegistryWriter.new()
		_registry_writer.write(port)

	print("[claude_mcp] bridge up on 127.0.0.1:%d" % port)


## True only in a real interactive editor — false under `--headless`
## (DisplayServer "headless") so export/headless child processes never touch the
## shared per-project registry file. See _enter_tree for why this matters.
func _is_interactive_editor() -> bool:
	return Engine.is_editor_hint() and DisplayServer.get_name() != "headless"


func _exit_tree() -> void:
	if _registry_writer != null:
		_registry_writer.erase()
		_registry_writer = null
	if _socket_server != null:
		_socket_server.stop()
		_socket_server.queue_free()
		_socket_server = null
	if _runtime_debugger != null:
		remove_debugger_plugin(_runtime_debugger)
		_runtime_debugger = null
	_tool_registry = null
	print("[claude_mcp] bridge down")


## Add the in-game endpoint as a project autoload if not already present, so a
## `run_project` launch carries it. Idempotent. We do NOT remove it on _exit_tree:
## removing an autoload edits project.godot, and silently churning the user's
## project on every disable is worse than leaving one benign autoload (it no-ops
## outside an editor debug session). The README documents how to remove it.
func _ensure_runtime_autoload() -> void:
	if not ProjectSettings.has_setting("autoload/%s" % RUNTIME_AUTOLOAD_NAME):
		# A leading "*" marks the autoload as a singleton Node instance.
		ProjectSettings.set_setting("autoload/%s" % RUNTIME_AUTOLOAD_NAME, "*" + RUNTIME_AUTOLOAD_PATH)
		ProjectSettings.save()
