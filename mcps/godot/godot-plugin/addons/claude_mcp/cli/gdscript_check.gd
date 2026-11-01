extends SceneTree
## Parse-check GDScript files the way the game loads them. Run by the
## gdscript_check CLI tool, never by the editor:
##
##   godot --headless --path <project> -s res://addons/claude_mcp/cli/gdscript_check.gd -- res://a.gd res://b.gd
##
## Prints `ok: <path>` or `PARSE FAIL: <path>` per script. Godot's own
## `SCRIPT ERROR:` lines (with res://path:line) print above each failure.
## Exit 0 when every script loads, 1 when any does not, 2 when none given.
##
## Loads in _initialize(), after autoloads are registered. `--check-only`
## and _init() run before that, so valid code that names an autoload fails
## with "Identifier not found".


func _initialize() -> void:
	var paths := OS.get_cmdline_user_args()
	if paths.is_empty():
		printerr("gdscript_check: no scripts given. Pass res:// paths after `--`.")
		quit(2)
		return
	var failed := 0
	for path in paths:
		var script := load(path) as Script
		# An @abstract script (Godot 4.5+) is valid but can't be instantiated.
		var abstract: bool = script != null and script.has_method("is_abstract") and script.call("is_abstract")
		if script == null or not (script.can_instantiate() or abstract):
			print("PARSE FAIL: ", path)
			failed += 1
		else:
			print("ok: ", path)
	quit(1 if failed > 0 else 0)
