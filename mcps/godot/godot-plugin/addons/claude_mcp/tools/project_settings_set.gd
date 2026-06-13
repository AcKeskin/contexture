@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## project_settings_set — write a single ProjectSettings entry and save to project.godot.
##
## When the key already exists its current Godot type is used to pick a coercion
## hint (Vector2, Color, bool, int, float, String). When the key is new the JSON
## value is coerced without a hint (primitives + strings only; ambiguous structures
## require the key to already exist).
##
## NOTE: this writes directly to project.godot via ProjectSettings.save().
## It is NOT undoable via Ctrl+Z — it bypasses the EditorUndoRedoManager.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")


func tool_name() -> String:
	return "project_settings_set"


func description() -> String:
	return "Write a ProjectSettings entry and persist it to project.godot. Infers the Godot type from the existing setting when possible. NOT undoable."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["key", "value"],
		"properties": {
			"key": {"type": "string", "description": "ProjectSettings key, e.g. 'application/config/name'."},
			"value": {"description": "New value. Primitives, strings, bools. Vectors/Colors accepted when the key already exists with that type."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var key := str(params.get("key", ""))
	if key.is_empty():
		return err("InvalidInput", "Parameter 'key' is required.")
	if not params.has("value"):
		return err("InvalidInput", "Parameter 'value' is required.")

	var raw = params["value"]
	var hint := ""
	if ProjectSettings.has_setting(key):
		hint = _type_name(typeof(ProjectSettings.get_setting(key)))

	var coerced = McpCoercion.coerce(raw, hint)
	if McpCoercion.is_unsupported(coerced):
		return err("InvalidInput",
			"Cannot coerce value to the expected type for key '" + key + "'" +
			(" (expected: " + hint + ")" if hint != "" else " (ambiguous structure — key must already exist to infer type)") + ".")

	ProjectSettings.set_setting(key, coerced)
	var e := ProjectSettings.save()
	if e != OK:
		return err("ToolError", "ProjectSettings.save() failed with error code " + str(e) + ".")

	return {
		"set": true,
		"key": key,
		"value": McpCoercion.to_json(coerced),
	}


## Map a Variant TYPE_* constant to the hint string McpCoercion understands.
func _type_name(t: int) -> String:
	match t:
		TYPE_BOOL:    return "bool"
		TYPE_INT:     return "int"
		TYPE_FLOAT:   return "float"
		TYPE_STRING:  return "String"
		TYPE_VECTOR2: return "Vector2"
		TYPE_VECTOR3: return "Vector3"
		TYPE_COLOR:   return "Color"
		_:            return ""
