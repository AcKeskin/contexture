@tool
extends "res://addons/claude_mcp/tools/runtime_tool.gd"
## runtime_set_property — change a property on a node in the RUNNING game (Bundle 4).
##
## Mutates LIVE game state (observable in the running window), NOT editor scene state
## — so it is deliberately NOT undo-wrapped (the running game has no editor undo
## stack). The new value is coerced in-game from the property's current type. Requires
## an editor-launched game (play_scene / F5 / F6); a run_project standalone launch has
## no debugger link and won't be seen.

func tool_name() -> String:
	return "runtime_set_property"


func description() -> String:
	return "Set a property on a node in the running game's live scene tree (observable in the game window). Not undoable — this changes live game state, not the editor scene. Requires a game launched THROUGH the editor (play_scene, or F5/F6); a run_project/standalone launch will NOT connect."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "property", "value"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the running game's root."},
			"property": {"type": "string", "description": "Property name to set."},
			"value": {"description": "New value (coerced to the property's current type in-game)."},
		},
	}


func runtime_message() -> String:
	return "set_property"


func reply_kind() -> String:
	return "property"


func build_payload(params: Dictionary) -> Dictionary:
	return {
		"nodePath": str(params.get("nodePath", "")),
		"property": str(params.get("property", "")),
		"value": params.get("value"),
	}
