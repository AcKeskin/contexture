@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## scene_create — create a new .tscn file on disk with a single root node.
##
## Does NOT open the scene after creation; use scene_open for that.
## The root node name is derived from the path basename (no extension).
## Validates rootType via ClassDB before attempting instantiation.

func tool_name() -> String:
	return "scene_create"


func description() -> String:
	return "Create a new scene file (.tscn) at the given res:// path with a single root node of the specified type. Does not open the scene."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path"],
		"properties": {
			"path": {"type": "string", "description": "res:// path for the new scene file, e.g. 'res://scenes/MyScene.tscn'."},
			"rootType": {"type": "string", "description": "Godot class name for the root node. Defaults to 'Node'."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))
	if path.is_empty():
		return err("InvalidInput", "'path' is required.")

	var root_type := str(params.get("rootType", "Node"))
	if root_type.is_empty():
		root_type = "Node"

	if not ClassDB.class_exists(root_type):
		return err("InvalidInput", "'%s' is not a known Godot class." % root_type)
	if not ClassDB.can_instantiate(root_type):
		return err("InvalidInput", "'%s' cannot be instantiated." % root_type)

	# Derive the root node name from the basename without extension.
	var base := path.get_file().get_basename()
	if base.is_empty():
		base = root_type

	var root: Node = ClassDB.instantiate(root_type)
	if root == null:
		return err("ToolError", "ClassDB.instantiate('%s') returned null." % root_type)
	root.name = base

	var packed := PackedScene.new()
	packed.pack(root)

	# Free the temp root — it was never added to any tree.
	root.free()

	var e := ResourceSaver.save(packed, path)
	if e != OK:
		return err("ToolError", "ResourceSaver.save failed for '%s' (error %d)." % [path, e])

	return {"created": true, "path": path, "rootType": root_type}
