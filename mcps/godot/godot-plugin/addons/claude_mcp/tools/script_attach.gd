@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## script_attach — attach a script resource to a node in the active scene, undoably.
##
## Resolves the node by path from the edited scene root, loads the script at
## scriptPath, captures the old script for undo, then registers the assignment
## through EditorUndoRedoManager so Ctrl+Z reverts it. Works for both .gd and
## .cs scripts — both surface as Script resources.
##
## is_mutation: true — scene state is modified and wrapped in an undo action.

func tool_name() -> String:
	return "script_attach"


func description() -> String:
	return "Attach a script (.gd or .cs) to a node in the active scene. Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "scriptPath"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'Player' or 'World/Enemies/Goblin'."},
			"scriptPath": {"type": "string", "description": "res:// path to the script resource, e.g. 'res://player.gd'."},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var node_path_str := str(params.get("nodePath", ""))
	if node_path_str.is_empty():
		return err("InvalidInput", "'nodePath' is required.")

	var node := root.get_node_or_null(NodePath(node_path_str))
	if node == null:
		return err("InvalidInput", "Node not found at path: %s" % node_path_str)

	var script_path := str(params.get("scriptPath", ""))
	if not script_path.begins_with("res://"):
		return err("InvalidInput", "'scriptPath' must start with 'res://'. Got: %s" % script_path)

	if not ResourceLoader.exists(script_path):
		return err("InvalidInput", "No script found at: %s" % script_path)

	var scr := load(script_path)
	if not scr is Script:
		return err("InvalidInput", "Resource at '%s' is not a Script." % script_path)

	var old_script = node.get_script()

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: dispatcher should always supply undo for mutations.
		node.set_script(scr)
	else:
		undo.add_do_property(node, "script", scr)
		undo.add_undo_property(node, "script", old_script)

	return {"attached": true, "path": node_path_str, "script": script_path}
