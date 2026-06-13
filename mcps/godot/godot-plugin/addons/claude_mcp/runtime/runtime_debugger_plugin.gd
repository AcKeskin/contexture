@tool
extends EditorDebuggerPlugin
class_name McpRuntimeDebuggerPlugin
## Editor-side half of the Bundle 4 runtime channel.
##
## Registered with the editor via EditorPlugin.add_debugger_plugin(). It captures
## messages the running game pushes under "mcp_runtime:" and tracks the active
## debugger session_id so the editor can address the running game.
##
## Request/response correlation: the runtime socket tools (runtime_tree, etc.) call
## request(msg, data) and await the matching reply. Because EngineDebugger has no
## per-message id, we serialize runtime requests (one in flight at a time) and match
## the next reply of the expected kind to the waiting caller. This is sufficient for
## the v2 request/response model (no concurrent runtime calls; the socket dispatcher
## is single-threaded on _process — see [[godot-socket-on-process-is-main-thread]]).
##
## SPIKE GATE: prove request("ping",[token]) -> "pong" round-trips with a running
## game before the four runtime tools are built on this. If add_debugger_plugin /
## the capture path doesn't establish cleanly, Bundle 4 drops to v3.

const PREFIX := "mcp_runtime"

signal reply_received(kind: String, data: Array)
signal game_ready()           ## emitted when the in-game endpoint announces itself
signal session_changed(active: bool)

var _session_id: int = -1
var _session_active: bool = false


# ── EditorDebuggerPlugin overrides ───────────────────────────────────────────

func _has_capture(capture: String) -> bool:
	# We handle messages addressed "mcp_runtime:*".
	return capture == PREFIX


func _capture(message: String, data: Array, session_id: int) -> bool:
	# message arrives WITH the prefix on the editor side (unlike the game side),
	# e.g. "mcp_runtime:pong". Strip it to get the kind.
	var kind := message.trim_prefix("%s:" % PREFIX)
	match kind:
		"ready":
			emit_signal("game_ready")
			return true
		"pong", "tree", "property", "signal_result", "input_result", "error":
			emit_signal("reply_received", kind, data)
			return true
		_:
			return false


func _setup_session(session_id: int) -> void:
	_session_id = session_id
	var session := get_session(session_id)
	session.started.connect(func ():
		_session_active = true
		emit_signal("session_changed", true))
	session.stopped.connect(func ():
		_session_active = false
		emit_signal("session_changed", false))


# ── Editor → game request API (used by the runtime socket tools) ──────────────

func has_live_game() -> bool:
	return _session_active and _session_id != -1


## Send a runtime request to the running game. Fire-and-forget at the transport
## level; the caller awaits `reply_received` for the matching kind. Returns false if
## no live game session exists.
func request(msg: String, data: Array = []) -> bool:
	if not has_live_game():
		return false
	var session := get_session(_session_id)
	if session == null:
		return false
	session.send_message("%s:%s" % [PREFIX, msg], data)
	return true
