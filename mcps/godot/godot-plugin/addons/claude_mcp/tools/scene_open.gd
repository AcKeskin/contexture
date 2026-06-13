@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## scene_open — open a .tscn file in the Godot editor.
##
## Validates the resource exists before calling EditorInterface so the editor
## never receives a missing-file open request (which silently does nothing).
## Returns the root name from get_edited_scene_root() for caller confirmation.

func tool_name() -> String:
	return "scene_open"


func description() -> String:
	return "Open a scene file in the Godot editor. The scene becomes the active edited scene."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path"],
		"properties": {
			"path": {"type": "string", "description": "res:// path to the .tscn file to open."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))
	if path.is_empty():
		return err("InvalidInput", "'path' is required.")

	if not ResourceLoader.exists(path):
		return err("InvalidInput", "No scene at '%s'." % path)

	EditorInterface.open_scene_from_path(path)

	# Read back the edited scene root to confirm the open succeeded.
	var root := EditorInterface.get_edited_scene_root()
	var root_name = root.name if root != null else null

	return {"opened": true, "path": path, "editedScene": root_name}
