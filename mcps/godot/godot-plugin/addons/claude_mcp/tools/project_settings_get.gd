@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## project_settings_get — read a single ProjectSettings entry by key.
##
## Returns the current value as a JSON-safe shape via McpCoercion.to_json.
## NOTE: changes made via project_settings_set persist to project.godot and are
## NOT undoable via Ctrl+Z — they bypass the EditorUndoRedoManager entirely.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")


func tool_name() -> String:
	return "project_settings_get"


func description() -> String:
	return "Read a single ProjectSettings entry by key (e.g. 'application/config/name'). Returns the stored value as a JSON-safe shape."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["key"],
		"properties": {
			"key": {"type": "string", "description": "ProjectSettings key, e.g. 'application/config/name'."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var key := str(params.get("key", ""))
	if key.is_empty():
		return err("InvalidInput", "Parameter 'key' is required.")
	if not ProjectSettings.has_setting(key):
		return err("InvalidInput", "No setting: " + key)
	return {
		"key": key,
		"value": McpCoercion.to_json(ProjectSettings.get_setting(key)),
	}
