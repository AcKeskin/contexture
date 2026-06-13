@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## scene_info — describe the active edited scene.

func tool_name() -> String:
	return "scene_info"


func description() -> String:
	return "Return the active edited scene's name, path, root node name/type, and root child count. Reports cleanly when no scene is open."


func invoke(_params: Dictionary, _ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return {"sceneOpen": false}
	return {
		"sceneOpen": true,
		"name": root.name,
		"path": root.scene_file_path,
		"rootNodeName": str(root.name),
		"rootNodeType": root.get_class(),
		"rootChildCount": root.get_child_count(),
	}
