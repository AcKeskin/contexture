@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## stop_scene — stop the editor-launched game session.
##
## Symmetric counterpart to play_scene: that tool starts an editor-debugged game
## (EditorInterface.play_*), this one ends it (EditorInterface.stop_playing_scene),
## exactly like pressing the editor's Stop button / F8. Without this, the MCP could
## launch a game but never stop it from the tool surface — stopping required manual
## editor interaction.
##
## Reports whether a session was actually running when called (via
## is_playing_scene) so a no-op stop is distinguishable from a real one. The stop
## is asynchronous on the editor side; "wasPlaying" reflects the state observed at
## call time, not a post-stop confirmation. Poll runtime_tree (expect
## GameNotRunning) to confirm teardown if needed.
##
## is_mutation: false — stopping the game is not an undoable scene edit.

func tool_name() -> String:
	return "stop_scene"


func description() -> String:
	return "Stop the editor-launched game session (like the editor's Stop button / F8). Counterpart to play_scene. Returns wasPlaying:false if nothing was running. Does not affect a run_project/standalone launch."


func input_schema() -> Dictionary:
	return {"type": "object", "properties": {}}


func is_mutation() -> bool:
	return false


func invoke(_params: Dictionary, _ctx: Dictionary):
	var was_playing := EditorInterface.is_playing_scene()
	EditorInterface.stop_playing_scene()
	return {"stopped": true, "wasPlaying": was_playing}
