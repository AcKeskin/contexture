@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_create_control — add a Control-derived node to the active scene, undoably.
##
## The anchor preset (if given) is applied as a do-method AFTER add_child so that
## set_anchors_preset has a valid parent to compute against. Ctrl+Z reverts the
## creation in one step via EditorUndoRedoManager.

const McpAnchorPresets := preload("res://addons/claude_mcp/tools/anchor_presets.gd")


func tool_name() -> String:
	return "ui_create_control"


func description() -> String:
	return "Create a Control-derived node in the active scene under a given parent. Supports an optional anchor preset. Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["type", "parentPath"],
		"properties": {
			"type": {
				"type": "string",
				"description": "A Control-derived class name, e.g. 'Button', 'Label', 'Panel', 'VBoxContainer'.",
			},
			"parentPath": {
				"type": "string",
				"description": "Node path of the parent from the scene root.",
			},
			"anchorPreset": {
				"type": "string",
				"description": "Optional layout anchor preset name. Supported values: " + ", ".join(Array(McpAnchorPresets.names())),
			},
			"name": {
				"type": "string",
				"description": "Optional name for the new node. Defaults to the class name.",
			},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var type := str(params.get("type", ""))
	if type.is_empty():
		return err("InvalidInput", "'type' is required.")
	if not ClassDB.class_exists(type) or not ClassDB.is_parent_class(type, "Control"):
		return err("InvalidInput", "'%s' is not a Control-derived class." % type)
	if not ClassDB.can_instantiate(type):
		return err("InvalidInput", "'%s' cannot be instantiated." % type)

	var parent_path := str(params.get("parentPath", ""))
	if parent_path.is_empty():
		return err("InvalidInput", "'parentPath' is required.")
	var parent: Node = root.get_node_or_null(NodePath(parent_path))
	if parent == null:
		return err("InvalidInput", "Parent path not found: %s" % parent_path)

	# Resolve optional anchor preset before instantiating so we can fail early.
	var anchor_preset_name := str(params.get("anchorPreset", ""))
	var anchor_preset_value := -1
	if not anchor_preset_name.is_empty():
		anchor_preset_value = McpAnchorPresets.resolve(anchor_preset_name)
		if anchor_preset_value == -1:
			return err(
				"InvalidInput",
				"Unknown anchorPreset '%s'. Valid values: %s" % [
					anchor_preset_name,
					", ".join(Array(McpAnchorPresets.names())),
				]
			)

	var control: Control = ClassDB.instantiate(type)
	if control == null:
		return err("ToolError", "Failed to instantiate '%s'." % type)

	var node_name := str(params.get("name", ""))
	if not node_name.is_empty():
		control.name = node_name

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		parent.add_child(control)
		control.owner = root
		if anchor_preset_value != -1:
			control.set_anchors_preset(anchor_preset_value)
	else:
		undo.add_do_method(parent, "add_child", control)
		undo.add_do_method(control, "set_owner", root)
		if anchor_preset_value != -1:
			undo.add_do_method(control, "set_anchors_preset", anchor_preset_value)
		undo.add_do_reference(control)
		undo.add_undo_method(parent, "remove_child", control)

	var final_name := str(control.name)
	var path: String
	if parent == root:
		path = final_name
	else:
		path = "%s/%s" % [str(root.get_path_to(parent)), final_name]

	return {
		"created": true,
		"type": type,
		"name": final_name,
		"path": path,
		"anchorPreset": anchor_preset_name if not anchor_preset_name.is_empty() else null,
	}
