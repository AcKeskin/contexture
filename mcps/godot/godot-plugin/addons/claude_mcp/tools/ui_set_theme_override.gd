@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_set_theme_override — set a single per-node theme override on a Control, undoably.
##
## Mutation: captures the prior override state before applying so undo either restores
## the previous value (if the override was already set) or removes the override entirely
## (if it was not previously set). Undo is registered via add_do_method/add_undo_method
## because the add/remove APIs are methods, not settable properties.
##
## category must be one of: "color", "constant", "font_size", "stylebox".
## If omitted, it defaults to "color" — callers should always pass it explicitly.
##
## StyleBox coercion delegates to McpCoercion._to_stylebox via hint "StyleBox":
## accepts a res:// path string or an inline {"type":"flat","properties":{...}} dict.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")

const _VALID_CATEGORIES := ["color", "constant", "font_size", "stylebox"]


func tool_name() -> String:
	return "ui_set_theme_override"


func description() -> String:
	return (
		"Set a per-node theme override on a Control. "
		+ "category must be one of: color, constant, font_size, stylebox. "
		+ "Undoable in one step (Ctrl+Z)."
	)


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "property", "value"],
		"properties": {
			"nodePath": {
				"type": "string",
				"description": "Node path from the scene root, e.g. 'CanvasLayer/Label'.",
			},
			"property": {
				"type": "string",
				"description": "Override name, e.g. 'font_color', 'font_size', 'normal'.",
			},
			"value": {
				"description": "New value. Color: hex string / {r,g,b,a} / [r,g,b,a]. constant/font_size: int. stylebox: res:// path string or {type:'flat',properties:{...}}.",
			},
			"category": {
				"type": "string",
				"enum": _VALID_CATEGORIES,
				"description": "Override category. Defaults to 'color' when omitted — pass explicitly to avoid ambiguity.",
			},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var node_path := str(params.get("nodePath", ""))
	if node_path.is_empty():
		return err("InvalidInput", "'nodePath' is required.")

	var property := str(params.get("property", ""))
	if property.is_empty():
		return err("InvalidInput", "'property' is required.")

	if not params.has("value"):
		return err("InvalidInput", "'value' is required.")
	var raw_value = params["value"]

	var category := str(params.get("category", "color"))
	if category not in _VALID_CATEGORIES:
		return err(
			"InvalidInput",
			"Unknown category '%s'. Valid: %s" % [category, ", ".join(_VALID_CATEGORIES)]
		)

	var node := root.get_node_or_null(NodePath(node_path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % node_path)

	if not node is Control:
		return err("InvalidInput", "Node '%s' is not a Control (got %s)." % [node_path, node.get_class()])

	var control: Control = node
	var undo: EditorUndoRedoManager = ctx.get("undo")

	match category:
		"color":
			var coerced = McpCoercion.coerce(raw_value, "Color")
			if McpCoercion.is_unsupported(coerced):
				return err("InvalidInput", "Cannot coerce value to Color for property '%s'." % property)
			var had_prior : bool  = control.has_theme_color_override(property)
			var old_color : Color = control.get_theme_color(property) if had_prior else Color()
			if undo == null:
				control.add_theme_color_override(property, coerced)
			else:
				undo.add_do_method(control, "add_theme_color_override", property, coerced)
				if had_prior:
					undo.add_undo_method(control, "add_theme_color_override", property, old_color)
				else:
					undo.add_undo_method(control, "remove_theme_color_override", property)

		"constant":
			var coerced = McpCoercion.coerce(raw_value, "int")
			if McpCoercion.is_unsupported(coerced):
				return err("InvalidInput", "Cannot coerce value to int for property '%s'." % property)
			var had_prior : bool = control.has_theme_constant_override(property)
			var old_val   : int  = control.get_theme_constant(property) if had_prior else 0
			if undo == null:
				control.add_theme_constant_override(property, coerced)
			else:
				undo.add_do_method(control, "add_theme_constant_override", property, coerced)
				if had_prior:
					undo.add_undo_method(control, "add_theme_constant_override", property, old_val)
				else:
					undo.add_undo_method(control, "remove_theme_constant_override", property)

		"font_size":
			var coerced = McpCoercion.coerce(raw_value, "int")
			if McpCoercion.is_unsupported(coerced):
				return err("InvalidInput", "Cannot coerce value to int for property '%s'." % property)
			var had_prior : bool = control.has_theme_font_size_override(property)
			var old_val   : int  = control.get_theme_font_size(property) if had_prior else 0
			if undo == null:
				control.add_theme_font_size_override(property, coerced)
			else:
				undo.add_do_method(control, "add_theme_font_size_override", property, coerced)
				if had_prior:
					undo.add_undo_method(control, "add_theme_font_size_override", property, old_val)
				else:
					undo.add_undo_method(control, "remove_theme_font_size_override", property)

		"stylebox":
			var coerced = McpCoercion.coerce(raw_value, "StyleBox")
			if McpCoercion.is_unsupported(coerced):
				return err(
					"InvalidInput",
					"Cannot coerce value to StyleBox for property '%s'. "
					+ "Pass a res:// path string or {\"type\":\"flat\",\"properties\":{...}}." % property
				)
			var had_prior : bool     = control.has_theme_stylebox_override(property)
			# get_theme_stylebox falls back to the inherited theme when no override is set,
			# so only read it when has_theme_stylebox_override is true.
			var old_sb    : StyleBox = control.get_theme_stylebox(property) if had_prior else null
			if undo == null:
				control.add_theme_stylebox_override(property, coerced)
			else:
				undo.add_do_method(control, "add_theme_stylebox_override", property, coerced)
				if had_prior:
					undo.add_undo_method(control, "add_theme_stylebox_override", property, old_sb)
				else:
					undo.add_undo_method(control, "remove_theme_stylebox_override", property)

	return {
		"set":      true,
		"path":     node_path,
		"property": property,
		"category": category,
	}
