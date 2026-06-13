@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_set_anchors — apply a named anchor preset to a Control, undoably.
##
## Mutation: captures the four raw anchor floats before calling set_anchors_preset
## so that undo restores the exact prior geometry via individual set_anchor calls.
## set_anchors_preset is not a single property (it writes four anchor floats at once),
## so add_do_method/add_undo_method is used rather than add_do_property.
##
## SIDE_LEFT=0, SIDE_TOP=1, SIDE_RIGHT=2, SIDE_BOTTOM=3 (Godot 4.x enum constants).

const McpAnchorPresets := preload("res://addons/claude_mcp/tools/anchor_presets.gd")


func tool_name() -> String:
	return "ui_set_anchors"


func description() -> String:
	return "Apply a named anchor preset to a Control node in the active scene. Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "preset"],
		"properties": {
			"nodePath": {
				"type": "string",
				"description": "Node path from the scene root, e.g. 'CanvasLayer/Panel'.",
			},
			"preset": {
				"type": "string",
				"description": "Anchor preset name. Valid values: " + ", ".join(McpAnchorPresets.names()),
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

	var preset_name := str(params.get("preset", ""))
	if preset_name.is_empty():
		return err("InvalidInput", "'preset' is required.")

	var node := root.get_node_or_null(NodePath(node_path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % node_path)

	if not node is Control:
		return err("InvalidInput", "Node '%s' is not a Control (got %s)." % [node_path, node.get_class()])

	var p := McpAnchorPresets.resolve(preset_name)
	if p == -1:
		return err(
			"InvalidInput",
			"Unknown preset '%s'. Valid: %s" % [preset_name, ", ".join(McpAnchorPresets.names())]
		)

	var control: Control = node

	# Capture current anchors for undo restoration.
	var old_left   : float = control.anchor_left
	var old_top    : float = control.anchor_top
	var old_right  : float = control.anchor_right
	var old_bottom : float = control.anchor_bottom

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		control.set_anchors_preset(p)
	else:
		undo.add_do_method(control, "set_anchors_preset", p)
		# Restore each anchor individually. set_anchor signature:
		#   set_anchor(side: int, anchor: float, keep_offset=false, push_opposite_anchors=true)
		undo.add_undo_method(control, "set_anchor", SIDE_LEFT,   old_left,   false, false)
		undo.add_undo_method(control, "set_anchor", SIDE_TOP,    old_top,    false, false)
		undo.add_undo_method(control, "set_anchor", SIDE_RIGHT,  old_right,  false, false)
		undo.add_undo_method(control, "set_anchor", SIDE_BOTTOM, old_bottom, false, false)

	return {
		"set": true,
		"path": node_path,
		"preset": preset_name,
	}
