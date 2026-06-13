@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_set_property — set a typed property on a node, undoably.
##
## Mutation: reads the current value first (for both the undo payload and to infer
## the coercion hint). Coercion is delegated to McpCoercion — the current property
## value's TYPE_* constant is mapped to a type-name hint (McpCoercion.type_name) so
## the JSON input is coerced to the right Godot Variant before being applied. If the
## type is outside the coercion coverage the call fails with InvalidInput rather than
## silently setting a wrong type. EditorUndoRedoManager.add_do/undo_property gives a
## clean one-step Ctrl+Z.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")

func tool_name() -> String:
	return "node_set_property"


func description() -> String:
	return "Set a property on a node in the active scene. Accepts JSON-compatible values (strings, numbers, bools, Vector2/3 dicts or arrays, Color dicts/hex strings, NodePath strings, res:// resource paths). Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "property", "value"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'Player/Camera3D'."},
			"property": {"type": "string", "description": "Property name, e.g. 'position', 'visible', 'modulate'."},
			"value": {"description": "New value. Primitives, {x,y}/{x,y,z} dicts, Color hex strings, res:// paths."},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var path := str(params.get("nodePath", ""))
	if path.is_empty():
		return err("InvalidInput", "'nodePath' is required.")

	var property := str(params.get("property", ""))
	if property.is_empty():
		return err("InvalidInput", "'property' is required.")

	if not params.has("value"):
		return err("InvalidInput", "'value' is required.")
	var raw_value = params["value"]

	var node := root.get_node_or_null(NodePath(path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % path)

	# Read the current value — needed for the undo payload and as the coercion hint.
	var old_value = node.get(property)
	var hint := McpCoercion.type_name(typeof(old_value))

	var coerced = McpCoercion.coerce(raw_value, hint)
	if McpCoercion.is_unsupported(coerced):
		var type_label := hint if not hint.is_empty() else "unknown"
		return err("InvalidInput", "Cannot coerce the supplied value to the property type '%s' for property '%s'." % [type_label, property])

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		node.set(property, coerced)
	else:
		undo.add_do_property(node, property, coerced)
		undo.add_undo_property(node, property, old_value)

	return {
		"set": true,
		"path": path,
		"property": property,
		"value": McpCoercion.to_json(coerced),
	}
