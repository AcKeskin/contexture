@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_create — add a node to the active scene, undoably.
##
## Mutation: the dispatcher opens an EditorUndoRedoManager action and passes it
## in ctx["undo"]. We register the add as the do-method and the removal as the
## undo-method, so a single Ctrl+Z reverts the creation. Ownership is set to the
## edited scene root so the node persists in the .tscn.

func tool_name() -> String:
	return "node_create"


func description() -> String:
	return "Create a node of the given class in the active scene under an optional parent. Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["name", "type"],
		"properties": {
			"name": {"type": "string", "description": "Name for the new node."},
			"type": {"type": "string", "description": "Godot class name, e.g. 'Node3D', 'Sprite2D'."},
			"parentPath": {"type": "string", "description": "Node path of the parent from the scene root. Defaults to the root."},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var name := str(params.get("name", ""))
	var type := str(params.get("type", ""))
	if name.is_empty() or type.is_empty():
		return err("InvalidInput", "Both 'name' and 'type' are required.")
	if not ClassDB.class_exists(type) or not ClassDB.can_instantiate(type):
		return err("InvalidInput", "'%s' is not an instantiable Godot class." % type)

	var parent: Node = root
	var parent_path := str(params.get("parentPath", ""))
	if not parent_path.is_empty():
		parent = root.get_node_or_null(NodePath(parent_path))
		if parent == null:
			return err("InvalidInput", "Parent path not found: %s" % parent_path)

	var node: Node = ClassDB.instantiate(type)
	if node == null:
		return err("ToolError", "Failed to instantiate '%s'." % type)
	node.name = name

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		parent.add_child(node)
		node.owner = root
	else:
		undo.add_do_method(parent, "add_child", node)
		undo.add_do_method(node, "set_owner", root)
		undo.add_do_reference(node)
		undo.add_undo_method(parent, "remove_child", node)

	return {
		"created": true,
		"name": name,
		"type": type,
		"path": "%s/%s" % [str(root.get_path_to(parent)), name] if parent != root else name,
	}
