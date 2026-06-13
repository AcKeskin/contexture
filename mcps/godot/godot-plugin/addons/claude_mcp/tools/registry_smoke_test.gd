@tool
extends SceneTree
## Headless smoke test: load every registered tool handler, confirm each compiles
## and exposes a non-empty tool_name + a valid input_schema. Catches GDScript parse
## errors and bad API calls at the class-load level BEFORE the windowed editor gate
## (headless can't verify behavior, but it CAN verify the handlers compile + load —
## see [[godot-validate-in-windowed-editor]]).
##
## Run:
##   godot --headless -s addons/claude_mcp/tools/registry_smoke_test.gd --path <project>
## Exits non-zero on any load/parse failure.

const ToolRegistry := preload("res://addons/claude_mcp/tools/tool_registry.gd")

var _failures: int = 0


func _init() -> void:
	var reg = ToolRegistry.new()
	reg.register_builtins()
	var tools: Array = reg.describe_tools()

	print("Registered tool surface (%d entries):" % tools.size())
	var seen := {}
	for t in tools:
		var name := str(t.get("name", ""))
		var surface := str(t.get("surface", ""))
		var schema = t.get("inputSchema", null)
		var mut := ""
		if reg.has(name):
			mut = "  mutation" if reg.get_handler(name).is_mutation() else ""
		print("  [%s] %-26s%s" % [surface, name, mut])

		if name == "":
			_fail("empty tool_name in descriptor entry")
		if seen.has(name):
			_fail("duplicate tool name: %s" % name)
		seen[name] = true
		if surface == "socket":
			if not (schema is Dictionary) or str(schema.get("type", "")) != "object":
				_fail("%s: input_schema is not an object schema" % name)

	# Spot-check the v2 Bundle-1 surface is present.
	var expected := [
		"node_delete", "node_reparent", "node_set_property", "node_duplicate",
		"scene_create", "scene_open", "scene_save", "scene_reload",
		"script_create", "script_attach", "script_validate",
		"project_settings_get", "project_settings_set",
		"input_map_list", "input_map_add", "input_map_remove",
		# Bundle 3 — Game UI
		"ui_create_control", "ui_inspect_control", "ui_set_anchors",
		"ui_get_theme", "ui_set_theme_override", "ui_set_container_layout",
		# Bundle 2 — CLI (export_preset always; dotnet_build only on C# projects)
		"export_preset",
		# Bundle 4 — runtime introspection
		"runtime_tree", "runtime_get_property", "runtime_set_property", "runtime_emit_signal",
		# v3 — runtime input injection
		"runtime_inject_input",
	]
	for e in expected:
		if not seen.has(e):
			_fail("expected Bundle-1 tool missing from surface: %s" % e)

	# content-pipeline bundle — asset / resource / scene pipeline.
	for cp in ["import_asset", "set_resource", "instance_scene", "create_resource"]:
		if not seen.has(cp):
			_fail("expected content-pipeline tool missing from surface: %s" % cp)

	# v1 surface must still be present (additive proof).
	for v1 in ["project_info", "scene_info", "node_find", "node_create", "view", "run_project", "get_debug_output"]:
		if not seen.has(v1):
			_fail("v1 tool missing from surface (regression!): %s" % v1)

	if _failures > 0:
		push_error("registry_smoke_test: %d failure(s)" % _failures)
		quit(1)
	else:
		print("registry_smoke_test: ALL PASS (%d tools, v1+v2+content-pipeline surface intact)" % tools.size())
		quit(0)


func _fail(msg: String) -> void:
	print("  FAIL  ", msg)
	_failures += 1
