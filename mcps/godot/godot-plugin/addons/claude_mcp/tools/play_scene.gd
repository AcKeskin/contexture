@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## play_scene — run the project THROUGH the editor so the debugger connects.
##
## Why this exists separately from run_project: run_project (CLI surface) spawns a
## bare standalone godot process with no --remote-debug, so EngineDebugger is
## inactive in that game and the Bundle 4 runtime_* tools can never reach it
## (they return GameNotRunning). play_scene drives EditorInterface.play_*(), which
## launches the game as an editor-debugged session — exactly like pressing F5/F6.
## That establishes the EditorDebuggerPlugin session our runtime endpoint needs,
## so runtime_tree / runtime_get_property / runtime_set_property /
## runtime_emit_signal work after a play_scene launch with no manual F-key.
##
## Modes:
##   no args         -> EditorInterface.play_main_scene()    (project's main scene)
##   {path: res://X} -> EditorInterface.play_custom_scene(X) (a specific scene)
##
## is_mutation: false — running the game is not an undoable scene edit.
## The launched game is stopped with stop_playing / closing its window, or by the
## editor's Stop button; this tool does not block waiting for it (the debugger
## session comes up asynchronously — poll runtime_tree to confirm readiness).

func tool_name() -> String:
	return "play_scene"


func description() -> String:
	return "Run the project through the editor (like F5/F6) so the live debugger connects and runtime_* tools can reach the running game. Omit 'path' to play the main scene, or pass a res:// scene to play that one. Use run_project instead for a headless/standalone launch (runtime tools will NOT connect to that)."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"properties": {
			"path": {"type": "string", "description": "Optional res:// scene to play. Omit to play the project's main scene."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))

	if path.is_empty():
		# Main scene must be configured, else play_main_scene silently no-ops.
		var main_scene := str(ProjectSettings.get_setting("application/run/main_scene", ""))
		if main_scene.is_empty():
			return err("InvalidInput", "No main scene configured (application/run/main_scene). Pass 'path' to play a specific scene.")
		EditorInterface.play_main_scene()
		return {"playing": true, "scene": main_scene, "mode": "main"}

	if not path.begins_with("res://"):
		return err("InvalidInput", "'path' must start with 'res://'. Got: %s" % path)
	if not ResourceLoader.exists(path):
		return err("InvalidInput", "No scene at '%s'." % path)

	EditorInterface.play_custom_scene(path)
	return {"playing": true, "scene": path, "mode": "custom"}
