@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_set_container_layout — configure layout parameters on a Container, undoably.
##
## Mutation: only the params that are actually present in the call are applied.
## Each applied param is undo-wrapped individually so any single Ctrl+Z reverts the
## whole action (they share the same EditorUndoRedoManager action frame opened by
## the dispatcher).
##
## Supported params and their Godot backing:
##   GridContainer:
##     columns        — real int property on GridContainer; undo via add_do/undo_property.
##     hSeparation    — theme constant "h_separation"; undo via add_do/undo_method.
##     vSeparation    — theme constant "v_separation"; undo via add_do/undo_method.
##   BoxContainer (VBoxContainer / HBoxContainer):
##     separation     — theme constant "separation"; undo via add_do/undo_method.
##
## Theme-constant undo: restore the prior value with add_theme_constant_override if it
## was previously overridden, otherwise remove the override with remove_theme_constant_override.
##
## Note: the GridContainer theme-constant names "h_separation" / "v_separation" are the
## documented Godot 4.x names used in the theme editor and get/add_theme_constant APIs.
## BoxContainer uses "separation". These are flagged as uncertain — verify against your
## Godot 4.6 theme inspector if layout gaps don't respond.

func tool_name() -> String:
	return "ui_set_container_layout"


func description() -> String:
	return (
		"Configure layout parameters on a Container node (GridContainer, VBoxContainer, HBoxContainer). "
		+ "Applies only params that are present. Undoable in one step (Ctrl+Z). "
		+ "Supported params: columns (GridContainer int property), "
		+ "hSeparation / vSeparation (GridContainer theme constants), "
		+ "separation (BoxContainer theme constant)."
	)


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath"],
		"properties": {
			"nodePath": {
				"type": "string",
				"description": "Node path from the scene root, e.g. 'UI/Grid'.",
			},
			"columns": {
				"type": "integer",
				"description": "GridContainer only. Number of columns.",
			},
			"hSeparation": {
				"type": "integer",
				"description": "GridContainer only. Horizontal gap between cells (theme constant 'h_separation').",
			},
			"vSeparation": {
				"type": "integer",
				"description": "GridContainer only. Vertical gap between cells (theme constant 'v_separation').",
			},
			"separation": {
				"type": "integer",
				"description": "VBoxContainer / HBoxContainer only. Gap between items (theme constant 'separation').",
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

	var node := root.get_node_or_null(NodePath(node_path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % node_path)

	if not node is Container:
		return err("InvalidInput", "Node '%s' is not a Container (got %s)." % [node_path, node.get_class()])

	var undo: EditorUndoRedoManager = ctx.get("undo")
	var applied: Array = []

	# ── GridContainer: columns (real property) ───────────────────────────────
	if params.has("columns") and node is GridContainer:
		var new_cols := int(params["columns"])
		var old_cols : int = (node as GridContainer).columns
		if undo == null:
			(node as GridContainer).columns = new_cols
		else:
			undo.add_do_property(node, "columns", new_cols)
			undo.add_undo_property(node, "columns", old_cols)
		applied.append("columns")

	# ── GridContainer: hSeparation (theme constant "h_separation") ───────────
	if params.has("hSeparation") and node is GridContainer:
		var new_val := int(params["hSeparation"])
		_apply_theme_constant(node, "h_separation", new_val, undo)
		applied.append("hSeparation")

	# ── GridContainer: vSeparation (theme constant "v_separation") ───────────
	if params.has("vSeparation") and node is GridContainer:
		var new_val := int(params["vSeparation"])
		_apply_theme_constant(node, "v_separation", new_val, undo)
		applied.append("vSeparation")

	# ── BoxContainer: separation (theme constant "separation") ───────────────
	if params.has("separation") and node is BoxContainer:
		var new_val := int(params["separation"])
		_apply_theme_constant(node, "separation", new_val, undo)
		applied.append("separation")

	if applied.is_empty():
		return err(
			"InvalidInput",
			"No recognised layout params found for %s '%s'. "
			% [node.get_class(), node_path]
			+ "Accepted params: columns (GridContainer), hSeparation/vSeparation (GridContainer), separation (BoxContainer)."
		)

	return {
		"set":     true,
		"path":    node_path,
		"applied": applied,
	}


## Apply a theme constant override with undo. Captures the prior override state so
## undo removes the override (rather than restoring a stale inherited value) when
## the property had not been explicitly overridden before this call.
func _apply_theme_constant(
		control: Control,
		constant_name: String,
		new_val: int,
		undo: EditorUndoRedoManager
) -> void:
	var had_prior : bool = control.has_theme_constant_override(constant_name)
	# get_theme_constant falls back to inherited/default when no override is set;
	# only read it when has_theme_constant_override is true to avoid capturing
	# an inherited value as the "old" override.
	var old_val   : int  = control.get_theme_constant(constant_name) if had_prior else 0

	if undo == null:
		control.add_theme_constant_override(constant_name, new_val)
	else:
		undo.add_do_method(control, "add_theme_constant_override", constant_name, new_val)
		if had_prior:
			undo.add_undo_method(control, "add_theme_constant_override", constant_name, old_val)
		else:
			undo.add_undo_method(control, "remove_theme_constant_override", constant_name)
