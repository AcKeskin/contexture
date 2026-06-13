@tool
extends "res://addons/claude_mcp/tools/runtime_tool.gd"
## runtime_tree — return the live scene tree of the RUNNING game (Bundle 4).
##
## Read-only over the debugger channel; not an editor mutation (no undo). Requires a
## game launched THROUGH the editor (play_scene / F5 / F6) so the EngineDebugger
## session is live — returns GameNotRunning otherwise. NOTE: run_project launches a
## bare standalone process with no debugger link; runtime_* will NOT see it.

func tool_name() -> String:
	return "runtime_tree"


func description() -> String:
	return "Return the live scene tree (name/type/path, recursive) of the currently running game. Requires a game launched THROUGH the editor (play_scene, or F5/F6) so the debugger connects — a run_project/standalone launch will NOT connect and returns GameNotRunning."


func input_schema() -> Dictionary:
	return {"type": "object", "properties": {}}


func runtime_message() -> String:
	return "tree"


func reply_kind() -> String:
	return "tree"


func build_payload(_params: Dictionary) -> Dictionary:
	return {}
