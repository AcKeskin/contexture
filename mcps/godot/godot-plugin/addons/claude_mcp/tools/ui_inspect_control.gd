@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_inspect_control — read layout, size, and theme-override state from a Control.
##
## Theme overrides are enumerated by scanning get_property_list() for entries whose
## name begins with "theme_override_colors/", "theme_override_fonts/",
## "theme_override_font_sizes/", "theme_override_constants/", or
## "theme_override_styles/". This is the documented robust path for Godot 4.x:
## the per-category _list() helpers return theme-type entries, NOT the node's own
## per-property overrides. The property list scan is authoritative for overrides.
##
## Values are serialized with McpCoercion.to_json so Color, StyleBox, etc. come
## back as JSON-safe shapes rather than engine objects.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")

## Property-list prefixes that carry theme overrides on a Control node.
const _OVERRIDE_PREFIXES := [
	"theme_override_colors/",
	"theme_override_fonts/",
	"theme_override_font_sizes/",
	"theme_override_constants/",
	"theme_override_styles/",
]


func tool_name() -> String:
	return "ui_inspect_control"


func description() -> String:
	return "Read layout (anchors, offsets, size, position), size flags, and theme overrides from a Control node in the active scene."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath"],
		"properties": {
			"nodePath": {
				"type": "string",
				"description": "Node path from the scene root to the Control node.",
			},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, ctx: Dictionary):
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return err("InvalidInput", "No scene is open.")

	var node_path := str(params.get("nodePath", ""))
	if node_path.is_empty():
		return err("InvalidInput", "'nodePath' is required.")

	var node: Node = root.get_node_or_null(NodePath(node_path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % node_path)
	if not (node is Control):
		return err("InvalidInput", "Node '%s' is not a Control." % node_path)

	var control: Control = node

	return {
		"path": node_path,
		"type": control.get_class(),
		"anchors": {
			"left":   control.anchor_left,
			"top":    control.anchor_top,
			"right":  control.anchor_right,
			"bottom": control.anchor_bottom,
		},
		"offsets": {
			"left":   control.offset_left,
			"top":    control.offset_top,
			"right":  control.offset_right,
			"bottom": control.offset_bottom,
		},
		"size": {
			"x": control.size.x,
			"y": control.size.y,
		},
		"position": {
			"x": control.position.x,
			"y": control.position.y,
		},
		"sizeFlags": {
			"horizontal": control.size_flags_horizontal,
			"vertical":   control.size_flags_vertical,
		},
		"themeOverrides": _collect_theme_overrides(control),
	}


## Walk the node's property list and collect every theme override that is set.
## A property listed under a "theme_override_*/" prefix is considered "set" when
## its value differs from the type's zero/null — but because there is no
## has_theme_*_override() that takes a raw property-list name (only a short name
## without the category prefix), we use the property list usage flags instead:
## PROPERTY_USAGE_STORAGE is set on a property only when it has a non-default
## value, which is exactly "the override has been applied". This avoids iterating
## through potentially absent has_theme_color_override() calls that require us to
## split and re-categorize the key.
static func _collect_theme_overrides(control: Control) -> Dictionary:
	var result: Dictionary = {}
	for prop in control.get_property_list():
		var pname: String = prop["name"]
		var matched := false
		for prefix in _OVERRIDE_PREFIXES:
			if pname.begins_with(prefix):
				matched = true
				break
		if not matched:
			continue
		# Only report overrides that are actually stored (non-default).
		if not (prop["usage"] & PROPERTY_USAGE_STORAGE):
			continue
		var value = control.get(pname)
		result[pname] = McpCoercion.to_json(value)
	return result
