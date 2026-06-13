@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## scene_save — save the currently open scene, with optional save-as target.
##
## If `path` is provided, delegates to EditorInterface.save_scene_as(path).
## If `path` is omitted, delegates to EditorInterface.save_scene().
## Both overloads require a scene to be open; absence is an InvalidInput error.

func tool_name() -> String:
	return "scene_save"


func description() -> String:
	return "Save the currently open scene. If 'path' is given, performs a save-as to that res:// location."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"properties": {
			"path": {"type": "string", "description": "Optional res:// path for save-as. Omit to save in place."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var path := str(params.get("path", ""))

	var save_path: String
	if not path.is_empty():
		# save_scene_as(path, with_preview=true) — second arg is optional.
		EditorInterface.save_scene_as(path)
		save_path = path
	else:
		var e := EditorInterface.save_scene()
		if e != OK:
			return err("ToolError", "EditorInterface.save_scene() failed (error %d)." % e)
		save_path = str(root.scene_file_path)

	return {"saved": true, "path": save_path}
