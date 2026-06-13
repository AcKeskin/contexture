@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_duplicate — duplicate a node under the same parent, undoably.
##
## Mutation: calls Node.duplicate() which clones the subtree, optionally renames
## the duplicate, then adds it as a sibling of the original. Ownership must be
## set recursively on the duplicate and all its children so the duplicated subtree
## persists in the .tscn file — _set_owner_recursive walks the tree. The undo-path
## simply removes the duplicate from its parent; add_do_reference keeps it alive
## across the undo so a subsequent redo can re-add it correctly.

func tool_name() -> String:
	return "node_duplicate"


func description() -> String:
	return "Duplicate a node (and its subtree) under the same parent in the active scene. Optionally rename the copy. Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'Player/Sword'."},
			"newName": {"type": "string", "description": "Name for the duplicate. Defaults to the original name with a numeric suffix assigned by Godot."},
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

	var node := root.get_node_or_null(NodePath(path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % path)

	if node == root:
		return err("InvalidInput", "Cannot duplicate the scene root.")

	var parent := node.get_parent()

	var dup: Node = node.duplicate()
	if dup == null:
		return err("ToolError", "Node.duplicate() returned null for '%s'." % path)

	var new_name := str(params.get("newName", ""))
	if not new_name.is_empty():
		dup.name = new_name

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		parent.add_child(dup)
		_set_owner_recursive(dup, root)
	else:
		undo.add_do_method(parent, "add_child", dup)
		undo.add_do_method(self, "_set_owner_recursive", dup, root)
		undo.add_do_reference(dup)
		undo.add_undo_method(parent, "remove_child", dup)

	var result_name := str(dup.name)
	# Match node_create's path shape: a child of root is just its name, not "./name".
	var result_path := result_name if parent == root else "%s/%s" % [str(root.get_path_to(parent)), result_name]

	return {
		"duplicated": true,
		"path": result_path,
		"name": result_name,
	}


## Set the scene root as owner for the duplicate and every node in its subtree so
## all nodes are saved into the .tscn file. Must be called after add_child so the
## node is inside the tree (owner assignment requires the node to be in the tree).
func _set_owner_recursive(node: Node, owner: Node) -> void:
	node.owner = owner
	for child in node.get_children():
		_set_owner_recursive(child, owner)
