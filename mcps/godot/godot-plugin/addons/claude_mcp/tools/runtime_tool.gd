@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
class_name McpRuntimeTool
## Base for the Bundle 4 runtime tools (runtime_tree/get/set/emit).
##
## Each runtime tool sends a request over the debugger channel to the running game
## and awaits the matching reply. The shared await/timeout/no-game handling lives
## here so the four concrete tools only declare their message + payload + reply kind
## (deletion test: four callers, so the seam is real, not speculative).
##
## The dispatcher runs on the editor main thread (_process tick); awaiting the
## EditorDebuggerPlugin's `reply_received` signal suspends this coroutine until the
## game answers (or the timeout fires), then the dispatcher marshals the result back
## to the socket. No cross-thread work — see [[godot-socket-on-process-is-main-thread]].

const REPLY_TIMEOUT_SEC := 5.0


## Subclasses override: the request message (e.g. "tree"), the reply kind to await
## (e.g. "tree"/"property"/"signal_result"), and how to build the request payload.
func runtime_message() -> String:
	return ""


func reply_kind() -> String:
	return ""


func build_payload(_params: Dictionary) -> Dictionary:
	return {}


## Concrete tools usually don't override invoke — they declare the three hooks above.
func invoke(params: Dictionary, ctx: Dictionary):
	var runtime = ctx.get("runtime")
	if runtime == null:
		return err("ToolError", "Runtime channel not wired (no EditorDebuggerPlugin). This is a build error.")
	if not runtime.has_live_game():
		return err("GameNotRunning", "No game is running. Launch it with run_project first, then retry.")

	var payload := build_payload(params)
	var want := reply_kind()

	# Await the next reply of the wanted kind, with a timeout so a missing/hung game
	# can never wedge the dispatcher.
	var sent: bool = runtime.request(runtime_message(), [payload])
	if not sent:
		return err("GameNotRunning", "Failed to send to the running game (session closed).")

	var result = await _await_reply(runtime, want)
	if result == null:
		return err("ToolError", "Timed out after %.0fs waiting for the running game to reply." % REPLY_TIMEOUT_SEC)
	# The game wraps tool-level failures as {error: "..."}.
	if result is Dictionary and result.has("error"):
		return err("ToolError", str(result["error"]))
	return result


## Wait for `reply_received(kind, data)` where kind == want, or null on timeout.
func _await_reply(runtime, want: String):
	var tree := EditorInterface.get_edited_scene_root()
	# Use the plugin's own SceneTree for the timeout timer — get_tree() isn't on a
	# RefCounted tool, so use Engine's main loop via a one-shot await race.
	var got = [null, false]
	var on_reply := func(kind: String, data: Array):
		if not got[1] and kind == want:
			got[0] = data[0] if data.size() > 0 else {}
			got[1] = true
	runtime.reply_received.connect(on_reply)

	var elapsed := 0.0
	while not got[1] and elapsed < REPLY_TIMEOUT_SEC:
		await Engine.get_main_loop().process_frame
		elapsed += 0.016 # ~1 frame; coarse but bounded
	if runtime.reply_received.is_connected(on_reply):
		runtime.reply_received.disconnect(on_reply)
	return got[0] if got[1] else null
