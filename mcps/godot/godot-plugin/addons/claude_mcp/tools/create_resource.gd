@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## create_resource — author a custom Godot Resource (.tres) data file.
##
## The idiomatic, inspector-friendly data layer for a data-driven game: building
## definitions, item stats, NPC records as native typed Resources. Constructs a
## Resource, optionally binds a custom script class, applies exported field values,
## and saves it as a .tres that load()s back with fields intact (round-trip).
##
## Script binding ordering: set_script(load(script)) BEFORE applying properties so
## the exported fields exist on the object. A C# Resource subclass needs its
## assembly built first — if the script fails to load (unbuilt assembly), we return
## a structured "run dotnet_build first" error rather than hiding a build inside a
## data-write tool (spec Open-Q lean).
##
## is_mutation: false — writes a project file, not editor scene state.

const McpCoercion := preload("res://addons/claude_mcp/tools/value_coercion.gd")


func tool_name() -> String:
	return "create_resource"


func description() -> String:
	return "Author a custom Godot Resource (.tres) at a res:// path: optionally bind a custom Resource script class, set exported field values, and save. Round-trips via load() with fields intact; inspector-openable. The data layer for a data-driven game."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path"],
		"properties": {
			"path": {"type": "string", "description": "res:// destination .tres path, e.g. 'res://data/sword.tres'."},
			"script": {"type": "string", "description": "Optional res:// path to a custom Resource script class the .tres extends."},
			"properties": {"type": "object", "description": "Exported field name -> value. Coerced to the field's type where known."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))
	if not path.begins_with("res://"):
		return err("InvalidInput", "'path' must start with res://. Got: %s" % path)
	if path.get_extension().to_lower() != "tres":
		return err("InvalidInput", "'path' must end in .tres. Got: %s" % path)
	if path.begins_with(_PROTECTED_PREFIX):
		return err("InvalidInput", "Refusing to write under '%s' (the MCP plugin's own source)." % _PROTECTED_PREFIX)

	var res := Resource.new()

	# Optional custom script class. Bind BEFORE setting properties so fields exist.
	var script_path := str(params.get("script", ""))
	if not script_path.is_empty():
		if not script_path.begins_with("res://"):
			return err("InvalidInput", "'script' must start with res://. Got: %s" % script_path)
		var scr = load(script_path)
		if scr == null:
			# A C# Resource subclass whose assembly isn't built loads as null.
			return err("InvalidInput", "Could not load script '%s'. If this is a C# Resource class, run dotnet_build first (its assembly must compile before the script loads)." % script_path)
		if not (scr is Script):
			return err("InvalidInput", "'%s' is not a Script resource." % script_path)
		res.set_script(scr)

	# Apply exported field values. When the field exists on the (script-bound) resource
	# and its current value yields a coercion hint, coerce the JSON value to that type
	# (e.g. a [x,y] array → Vector2). Otherwise — no script, unknown field, or a type
	# with no hint — set the raw JSON value. Raw fallback is deliberate: .tres fields
	# are author-supplied and ResourceSaver serialises the JSON-native value faithfully;
	# a bad type surfaces on load() rather than being silently coerced wrong here.
	var props: Dictionary = params.get("properties", {})
	for key in props:
		var field := str(key)
		var raw = props[field]
		var coerced = raw
		if field in res:
			var hint := McpCoercion.type_name(typeof(res.get(field)))
			if hint != "":
				var c = McpCoercion.coerce(raw, hint)
				if not McpCoercion.is_unsupported(c):
					coerced = c
		res.set(field, coerced)

	var save_err := ResourceSaver.save(res, path)
	if save_err != OK:
		return err("ToolError", "ResourceSaver.save failed for '%s'. Error: %s" % [path, error_string(save_err)])

	# Refresh the editor filesystem so the .tres shows up without a manual rescan.
	EditorInterface.get_resource_filesystem().scan()

	return {"created": true, "path": path}
