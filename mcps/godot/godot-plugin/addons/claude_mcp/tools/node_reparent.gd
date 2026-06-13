@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_reparent — move a node under a different parent, undoably.
##
## Mutation: captures the old parent and the old child index before making any
## change. The do-path removes from old parent and adds to new parent with owner
## set to root. The undo-path removes from new parent, re-adds to old parent, then
## uses move_child to restore the original index, and resets the owner. Reparenting
## a node under itself or any of its own descendants is rejected as InvalidInput.

func tool_name() -> String:
	return "node_reparent"


func description() -> String:
	return "Move a node to a new parent in the active scene. Undoable in one step (Ctrl+Z). Reparenting under self or a descendant is rejected."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "newParentPath"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'Player/Sword'."},
			"newParentPath": {"type": "string", "description": "Node path of the new parent. Use '' or '.' for scene root."},
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

	var new_parent_path := str(params.get("newParentPath", ""))

	var node := root.get_node_or_null(NodePath(path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % path)

	if node == root:
		return err("InvalidInput", "Cannot reparent the scene root.")

	var new_parent: Node
	if new_parent_path.is_empty() or new_parent_path == ".":
		new_parent = root
	else:
		new_parent = root.get_node_or_null(NodePath(new_parent_path))
		if new_parent == null:
			return err("InvalidInput", "New parent not found: %s" % new_parent_path)

	# Guard: reparenting under self or a descendant creates a cycle.
	if new_parent == node or _is_descendant(node, new_parent):
		return err("InvalidInput", "Cannot reparent '%s' under itself or one of its descendants." % path)

	var old_parent := node.get_parent()
	var old_index := node.get_index()
	# Match node_create's path shape: a child of root is just its name, not "./name".
	var new_path := str(node.name) if new_parent == root else "%s/%s" % [str(root.get_path_to(new_parent)), str(node.name)]

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		old_parent.remove_child(node)
		new_parent.add_child(node)
		node.owner = root
	else:
		undo.add_do_method(old_parent, "remove_child", node)
		undo.add_do_method(new_parent, "add_child", node)
		undo.add_do_method(node, "set_owner", root)
		undo.add_do_reference(node)
		undo.add_undo_method(new_parent, "remove_child", node)
		undo.add_undo_method(old_parent, "add_child", node)
		undo.add_undo_method(old_parent, "move_child", node, old_index)
		undo.add_undo_method(node, "set_owner", root)

	return {
		"reparented": true,
		"path": new_path,
	}


## Returns true if `candidate` is a descendant of `ancestor`.
func _is_descendant(ancestor: Node, candidate: Node) -> bool:
	var current := candidate.get_parent()
	while current != null:
		if current == ancestor:
			return true
		current = current.get_parent()
	return false
