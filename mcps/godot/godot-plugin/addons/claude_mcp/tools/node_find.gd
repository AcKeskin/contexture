@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## node_find — locate a node in the active scene by name or path.
## Absence is a valid answer (returns {found:false}, not an error).

func tool_name() -> String:
	return "node_find"


func description() -> String:
	return "Find a node in the active scene by exact name or by node path. Returns its path, name, type, and transform (for Node2D/Node3D/Control). Not found is a valid result, not an error."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"properties": {
			"name": {"type": "string", "description": "Exact node name to search for."},
			"path": {"type": "string", "description": "Node path from the scene root, e.g. 'Player/Camera3D'."},
		},
	}


func invoke(params: Dictionary, _ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var found: Node = null
	var path := str(params.get("path", ""))
	var name := str(params.get("name", ""))

	if not path.is_empty():
		found = root.get_node_or_null(NodePath(path))
	elif not name.is_empty():
		found = _find_by_name(root, name)
	else:
		return err("InvalidInput", "Provide either 'name' or 'path'.")

	if found == null:
		return {"found": false}

	var info := {
		"found": true,
		"name": str(found.name),
		"path": str(root.get_path_to(found)),
		"type": found.get_class(),
	}
	if found is Node3D:
		info["transform"] = _xform3d(found)
	elif found is Node2D:
		info["transform"] = {"position": _v2(found.position), "rotation": found.rotation, "scale": _v2(found.scale)}
	elif found is Control:
		info["rect"] = {"position": _v2(found.position), "size": _v2(found.size)}
	return info


## First match by depth-first traversal order.
func _find_by_name(node: Node, name: String) -> Node:
	if str(node.name) == name:
		return node
	for child in node.get_children():
		var hit := _find_by_name(child, name)
		if hit != null:
			return hit
	return null


func _xform3d(n: Node3D) -> Dictionary:
	return {
		"position": _v3(n.position),
		"rotation": _v3(n.rotation),
		"scale": _v3(n.scale),
	}


func _v3(v: Vector3) -> Dictionary:
	return {"x": v.x, "y": v.y, "z": v.z}


func _v2(v: Vector2) -> Dictionary:
	return {"x": v.x, "y": v.y}
