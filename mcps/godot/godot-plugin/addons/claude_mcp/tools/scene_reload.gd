@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## scene_reload — reload a scene from disk, discarding in-editor unsaved changes.
##
## If `path` is given, that scene is reloaded (it need not be the active scene).
## If `path` is omitted, the currently open scene's scene_file_path is used.
## Errors if neither a path nor an open scene is available.
##
## Note: EditorInterface.reload_scene_from_path(path) is the canonical 4.x API
## for this operation; confirmed present in Godot 4.3+. Verify in 4.6 ClassDB if
## the method is ever missing (the editor will log an "unknown method" error).

func tool_name() -> String:
	return "scene_reload"


func description() -> String:
	return "Reload a scene from disk, discarding unsaved in-editor changes. Uses the currently open scene if no path is given."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"properties": {
			"path": {"type": "string", "description": "Optional res:// path of the scene to reload. Defaults to the currently open scene."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))

	if path.is_empty():
		var root := EditorInterface.get_edited_scene_root()
		if root == null:
			return err("InvalidInput", "No scene is open and no 'path' was provided.")
		path = str(root.scene_file_path)
		if path.is_empty():
			return err("InvalidInput", "The open scene has no file path (unsaved new scene). Provide 'path' explicitly.")

	EditorInterface.reload_scene_from_path(path)

	return {"reloaded": true, "path": path}
