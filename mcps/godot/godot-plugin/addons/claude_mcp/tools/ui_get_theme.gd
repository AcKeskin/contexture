@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## ui_get_theme — read all per-node theme overrides from a Control.
##
## Read-only: does not mutate scene state, no undo wrapper needed.
##
## Godot stores per-node theme overrides as pseudo-properties on the Control object.
## get_property_list() returns every exported property; those prefixed with
## "theme_override_colors/", "theme_override_fonts/", "theme_override_font_sizes/",
## "theme_override_constants/", or "theme_override_styles/" are the per-node overrides.
## A property that has never been set reads back as a default Variant (null, 0, Color(),
## etc.) — we detect "unset" by checking for null for Object types, and by checking
## whether the typed has_theme_*_override guard returns true for the short name.
##
## StyleBox serialization is intentionally shallow: only {resourcePath} or {class} is
## emitted. Fully expanding a StyleBoxFlat would bloat the payload for negligible gain —
## the caller can call node_set_property with a res:// path or ui_set_theme_override with
## an inline flat spec if it needs to inspect or modify internals.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")

## Category prefix strings, ordered to match the result dict keys.
const _PREFIXES := {
	"theme_override_colors/":     "colors",
	"theme_override_constants/":  "constants",
	"theme_override_font_sizes/": "fontSizes",
	"theme_override_styles/":     "styles",
	"theme_override_fonts/":      "fonts",
}


func tool_name() -> String:
	return "ui_get_theme"


func description() -> String:
	return "Return all per-node theme overrides currently set on a Control. StyleBox entries are serialized shallowly (resource path or class name only)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["nodePath"],
		"properties": {
			"nodePath": {
				"type": "string",
				"description": "Node path from the scene root, e.g. 'CanvasLayer/Button'.",
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

	var node := root.get_node_or_null(NodePath(node_path))
	if node == null:
		return err("InvalidInput", "Node not found: %s" % node_path)

	if not node is Control:
		return err("InvalidInput", "Node '%s' is not a Control (got %s)." % [node_path, node.get_class()])

	var control: Control = node

	var result := {
		"colors":    {},
		"constants": {},
		"fontSizes": {},
		"styles":    {},
		"fonts":     {},
	}

	for prop in control.get_property_list():
		var prop_name: String = prop["name"]
		var matched_category := ""
		var short_name := ""

		for prefix in _PREFIXES:
			if prop_name.begins_with(prefix):
				matched_category = _PREFIXES[prefix]
				short_name = prop_name.substr(prefix.length())
				break

		if matched_category.is_empty():
			continue

		# Guard: only emit entries that are actually overridden on this node.
		# has_theme_*_override is the authoritative check — reading the property
		# unconditionally would return inherited/default values for unset overrides.
		var is_set := false
		match matched_category:
			"colors":
				is_set = control.has_theme_color_override(short_name)
			"constants":
				is_set = control.has_theme_constant_override(short_name)
			"fontSizes":
				is_set = control.has_theme_font_size_override(short_name)
			"styles":
				is_set = control.has_theme_stylebox_override(short_name)
			"fonts":
				is_set = control.has_theme_font_override(short_name)

		if not is_set:
			continue

		var raw_value = control.get(prop_name)

		# Null or empty-Object refs mean no real value — skip.
		if raw_value == null:
			continue
		if raw_value is Object and not is_instance_valid(raw_value):
			continue

		var serialized
		if matched_category == "styles":
			# Shallow StyleBox serialization to keep payload bounded.
			if raw_value is StyleBox:
				var sb: StyleBox = raw_value
				if sb.resource_path != "":
					serialized = {"resourcePath": sb.resource_path}
				else:
					serialized = {"class": sb.get_class()}
			else:
				serialized = str(raw_value)
		elif matched_category == "fonts":
			# Fonts are Resources — same shallow treatment as StyleBox.
			if raw_value is Resource and (raw_value as Resource).resource_path != "":
				serialized = {"resourcePath": (raw_value as Resource).resource_path}
			elif raw_value is Object:
				serialized = {"class": raw_value.get_class()}
			else:
				serialized = McpCoercion.to_json(raw_value)
		else:
			serialized = McpCoercion.to_json(raw_value)

		result[matched_category][short_name] = serialized

	return {
		"path":      node_path,
		"type":      node.get_class(),
		"overrides": result,
	}
