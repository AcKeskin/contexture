@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_delete — remove a node from the active scene, undoably.
##
## Mutation: the dispatcher opens an EditorUndoRedoManager action and passes it
## in ctx["undo"]. We register the removal as the do-method and re-insertion as
## the undo-method, preserving the node's owner so a single Ctrl+Z puts the node
## back exactly as it was. The scene root itself cannot be deleted.

func tool_name() -> String:
	return "node_delete"


func description() -> String:
	return "Delete a node from the active scene by path. Undoable in one step (Ctrl+Z). The scene root cannot be deleted."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'Player/Sword'."},
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
		return err("InvalidInput", "Cannot delete the scene root.")

	var parent := node.get_parent()

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		parent.remove_child(node)
	else:
		undo.add_do_method(parent, "remove_child", node)
		undo.add_undo_method(parent, "add_child", node)
		undo.add_undo_method(node, "set_owner", root)
		undo.add_undo_reference(node)

	return {
		"deleted": true,
		"path": path,
	}
