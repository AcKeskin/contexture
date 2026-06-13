@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## instance_scene — instance a saved .tscn (PackedScene) into the active scene.
##
## The prefab primitive a management game leans on: reusable panels, list rows, map
## tiles. Loads the PackedScene, instantiates it, adds it under a parent, and sets
## owner so scene_save persists the instance REFERENCE (not an expanded subtree).
##
## Cycle rejection: instancing the edited scene's own scene file into itself would
## create an infinite-recursion .tscn. Rejected with a structured error BEFORE
## instantiate (the edited scene's resource path == scenePath).
##
## Mutation: wrapped via EditorUndoRedoManager — add_child + set_owner as do-methods,
## remove_child as undo, add_do_reference so the freed instance is retained for redo.
## Same shape as node_create. The dispatcher owns create_action / commit_action.

func tool_name() -> String:
	return "instance_scene"


func description() -> String:
	return "Instance a saved .tscn (PackedScene) into the active scene under a parent, as a single undoable node. Persists as an instance reference on save (not an expanded subtree). Rejects cycles (instancing a scene into itself). Undoable in one step (Ctrl+Z)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["scenePath"],
		"properties": {
			"scenePath": {"type": "string", "description": "res:// path to the .tscn to instance, e.g. 'res://prefabs/Row.tscn'."},
			"parentPath": {"type": "string", "description": "Node path of the parent from the scene root. Defaults to the scene root."},
			"name": {"type": "string", "description": "Optional name for the instance node."},
		},
	}


func is_mutation() -> bool:
	return true


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var scene_path := str(params.get("scenePath", ""))
	if not scene_path.begins_with("res://"):
		return err("InvalidInput", "'scenePath' must start with res://. Got: %s" % scene_path)

	# Cycle rejection: instancing the edited scene into itself recurses infinitely.
	if root.scene_file_path == scene_path:
		return err("InvalidInput", "Refusing to instance scene '%s' into itself (cycle)." % scene_path)

	var packed := load(scene_path)
	if not (packed is PackedScene):
		return err("InvalidInput", "Could not load a PackedScene from '%s'." % scene_path)

	var parent: Node = root
	var parent_path := str(params.get("parentPath", ""))
	if not parent_path.is_empty():
		parent = root.get_node_or_null(NodePath(parent_path))
		if parent == null:
			return err("InvalidInput", "Parent path not found: %s" % parent_path)

	var instance: Node = packed.instantiate()
	if instance == null:
		return err("ToolError", "Failed to instantiate PackedScene '%s'." % scene_path)

	var inst_name := str(params.get("name", ""))
	if not inst_name.is_empty():
		instance.name = inst_name

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		parent.add_child(instance)
		instance.owner = root
	else:
		undo.add_do_method(parent, "add_child", instance)
		undo.add_do_method(instance, "set_owner", root)
		undo.add_do_reference(instance)
		undo.add_undo_method(parent, "remove_child", instance)

	var final_name: String = str(instance.name) if not inst_name.is_empty() else scene_path.get_file().get_basename()
	return {
		"instanced": true,
		"path": scene_path,
		"parentPath": parent_path if not parent_path.is_empty() else ".",
		"instanceName": final_name,
	}
