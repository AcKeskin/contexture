@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## set_resource — build a Godot resource and assign it to a node property, undoably.
##
## node_set_property coerces primitive/value types; it cannot construct a Texture2D,
## an AtlasTexture (region rect), or a texture-bearing StyleBox. Those are too
## structured to be a clean property-value shape, so resource construction lives in
## this dedicated tool with a typed `resource` spec (decision recorded in the spec).
##
## Supported resource specs:
##   {type:"Texture2D",       path:"res://art/coin.png"}
##   {type:"AtlasTexture",    atlas:"res://art/sheet.png", region:[x,y,w,h]}
##   {type:"StyleBoxTexture", texture:"res://art/panel.png",
##                            marginLeft?,marginRight?,marginTop?,marginBottom?}
##
## Mutation: reads the property's current value for the undo leg, then assigns via
## EditorUndoRedoManager.add_do/undo_property — single-step Ctrl+Z, same shape as
## node_set_property. The dispatcher owns create_action / commit_action.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")


func tool_name() -> String:
	return "set_resource"


func description() -> String:
	return "Build a Godot resource (Texture2D from a res:// path, AtlasTexture from {atlas,region:[x,y,w,h]}, or StyleBoxTexture) and assign it to a node property in the active scene. Undoable in one step (Ctrl+Z). For sprite icons, sprite-sheet slicing, and themed panels."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath", "property", "resource"],
		"properties": {
			"nodePath": {"type": "string", "description": "Node path from the scene root, e.g. 'UI/Icon'."},
			"property": {"type": "string", "description": "Property to assign, e.g. 'texture'."},
			"resource": {
				"type": "object",
				"description": "Resource spec. {type:'Texture2D',path}. {type:'AtlasTexture',atlas,region:[x,y,w,h]}. {type:'StyleBoxTexture',texture,marginLeft?,...}.",
			},
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
	var property := str(params.get("property", ""))
	if property.is_empty():
		return err("InvalidInput", "'property' is required.")
	if not (params.get("resource") is Dictionary):
		return err("InvalidInput", "'resource' is required and must be an object with a 'type' field.")
	var spec: Dictionary = params["resource"]

	var node := root.get_node_or_null(NodePath(path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % path)
	if not (property in node):
		return err("InvalidInput", "Node '%s' has no property '%s'." % [path, property])

	var built = _build_resource(spec)
	if built is Dictionary and built.get("__mcp_error__", false):
		return built # already an err(...)

	var old_value = node.get(property)
	var resource_type := str(spec.get("type", ""))

	var undo: EditorUndoRedoManager = ctx.get("undo")
	if undo == null:
		# Defensive: should always be present for a mutation handler.
		node.set(property, built)
	else:
		# Property-based undo (same as node_set_property): the new value is applied on
		# do, the old value restored on undo. add_do_reference holds the freshly-built
		# resource so it survives a do→undo→redo cycle (on undo the property no longer
		# points at it). The old value, if a resource, stays referenced by the undo
		# stack via add_undo_property — no separate add_undo_reference needed.
		undo.add_do_property(node, property, built)
		undo.add_undo_property(node, property, old_value)
		undo.add_do_reference(built)

	return {
		"set": true,
		"nodePath": path,
		"property": property,
		"resourceType": resource_type,
	}


## Build the resource described by `spec`. Returns the Resource, or an err(...).
func _build_resource(spec: Dictionary):
	var type := str(spec.get("type", ""))
	match type:
		"Texture2D":
			var p := str(spec.get("path", ""))
			if not p.begins_with("res://"):
				return err("InvalidInput", "Texture2D requires a 'path' starting with res://. Got: %s" % p)
			var tex := load(p)
			if not (tex is Texture2D):
				return err("InvalidInput", "Could not load a Texture2D from '%s'." % p)
			return tex
		"AtlasTexture":
			var atlas_path := str(spec.get("atlas", ""))
			if not atlas_path.begins_with("res://"):
				return err("InvalidInput", "AtlasTexture requires an 'atlas' path starting with res://. Got: %s" % atlas_path)
			var atlas_tex := load(atlas_path)
			if not (atlas_tex is Texture2D):
				return err("InvalidInput", "Could not load the atlas Texture2D from '%s'." % atlas_path)
			var region = McpCoercion.coerce(spec.get("region"), "Rect2")
			if McpCoercion.is_unsupported(region):
				return err("InvalidInput", "AtlasTexture 'region' must be [x,y,w,h] or {x,y,w,h}. Got: %s" % str(spec.get("region")))
			var at := AtlasTexture.new()
			at.atlas = atlas_tex
			at.region = region
			return at
		"StyleBoxTexture":
			var tex_path := str(spec.get("texture", ""))
			if not tex_path.begins_with("res://"):
				return err("InvalidInput", "StyleBoxTexture requires a 'texture' path starting with res://. Got: %s" % tex_path)
			var sb_tex := load(tex_path)
			if not (sb_tex is Texture2D):
				return err("InvalidInput", "Could not load the StyleBoxTexture texture from '%s'." % tex_path)
			var sb := StyleBoxTexture.new()
			sb.texture = sb_tex
			if spec.has("marginLeft"):   sb.set_texture_margin(SIDE_LEFT, float(spec["marginLeft"]))
			if spec.has("marginRight"):  sb.set_texture_margin(SIDE_RIGHT, float(spec["marginRight"]))
			if spec.has("marginTop"):    sb.set_texture_margin(SIDE_TOP, float(spec["marginTop"]))
			if spec.has("marginBottom"): sb.set_texture_margin(SIDE_BOTTOM, float(spec["marginBottom"]))
			return sb
		_:
			return err("InvalidInput", "Unknown resource type '%s'. Supported: Texture2D, AtlasTexture, StyleBoxTexture." % type)
