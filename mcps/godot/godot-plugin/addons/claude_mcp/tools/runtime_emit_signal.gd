@tool
extends "res://addons/claude_mcp/tools/runtime_tool.gd"
## runtime_emit_signal — fire a signal on a node in the RUNNING game (Bundle 4).
##
## Emits a live signal (observable effect in the running game). Not undo-wrapped —
## live game state, not editor scene. Requires an editor-launched game (play_scene /
## F5 / F6); a run_project standalone launch has no debugger link and won't be seen.

func tool_name() -> String:
	return "runtime_emit_signal"


func description() -> String:
	return "Emit a signal on a node in the running game's live scene tree, with optional arguments. Requires a game launched THROUGH the editor (play_scene, or F5/F6); a run_project/standalone launch will NOT connect."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "signal"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the running game's root."},
			"signal": {"type": "string", "description": "Signal name to emit (must exist on the node)."},
			"args": {"type": "array", "description": "Optional positional arguments to pass to the signal."},
		},
	}


func runtime_message() -> String:
	return "emit_signal"


func reply_kind() -> String:
	return "signal_result"


func build_payload(params: Dictionary) -> Dictionary:
	return {
		"nodePath": str(params.get("nodePath", "")),
		"signal": str(params.get("signal", "")),
		"args": params.get("args", []),
	}
