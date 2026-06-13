@tool
extends "res://addons/claude_mcp/tools/runtime_tool.gd"
## runtime_get_property — read a property on a node in the RUNNING game (Bundle 4).
##
## Read-only over the debugger channel. Value is JSON-serialized in-game via the
## shared coercion helper. Requires an editor-launched game (play_scene / F5 / F6);
## a run_project standalone launch has no debugger link and won't be seen.

func tool_name() -> String:
	return "runtime_get_property"


func description() -> String:
	return "Read a property from a node in the running game's live scene tree. Requires a game launched THROUGH the editor (play_scene, or F5/F6); a run_project/standalone launch will NOT connect."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "property"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the running game's root (e.g. 'Main/Player')."},
			"property": {"type": "string", "description": "Property name to read, e.g. 'position', 'health'."},
		},
	}


func runtime_message() -> String:
	return "get_property"


func reply_kind() -> String:
	return "property"


func build_payload(params: Dictionary) -> Dictionary:
	return {
		"nodePath": str(params.get("nodePath", "")),
		"property": str(params.get("property", "")),
	}
