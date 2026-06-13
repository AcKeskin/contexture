@tool
extends Node
class_name McpGameDebuggerEndpoint
## In-GAME runtime introspection endpoint (Bundle 4).
##
## Runs inside the RUNNING GAME (not the editor). On _ready it registers an
## EngineDebugger message capture under the "mcp_runtime" prefix; the editor-side
## McpRuntimeDebuggerPlugin sends requests to it via the debugger session, and this
## endpoint answers by pushing a reply back with EngineDebugger.send_message.
##
## Channel (confirmed against Godot 4.6 docs — EngineDebugger / EditorDebuggerPlugin):
##   editor EditorDebuggerPlugin._capture(msg, data, session_id)
##        <—— EngineDebugger.send_message("mcp_runtime:reply", [...])  (game→editor)
##        ——> get_session(session_id).send_message("mcp_runtime:request", [...])  (editor→game)
##   This endpoint's register_message_capture callback receives the message with the
##   "mcp_runtime:" PREFIX STRIPPED (per the EngineDebugger docs note).
##
## SPIKE GATE: the only thing that must round-trip first is "ping" -> "pong". The
## four runtime tools (tree/get/set/emit) are built on this ONLY after the spike
## passes in a windowed run. Until then this answers ping and a minimal tree probe.
##
## Injection: this autoload is added to the running game by the editor plugin when a
## project runs (or the user adds it as an autoload). EngineDebugger is only active
## when the game is launched FROM the editor (debug session live) — in an exported
## build EngineDebugger.is_active() is false and this endpoint no-ops cleanly.

const PREFIX := "mcp_runtime"
## The coercion helper is editor-tools-tagged but uses no editor APIs, so it loads
## and runs fine inside the running game (verified: no EditorInterface refs). Reused
## rather than duplicated — the runtime endpoint is the 2nd caller of type_name (the
## deletion-test seam), so it lives on the shared helper, not a runtime copy.
const McpRuntimeJson := preload("res://addons/claude_mcp/tools/value_coercion.gd")


func _ready() -> void:
	if not EngineDebugger.is_active():
		# No editor debugger session (e.g. an exported build) — nothing to serve.
		return
	EngineDebugger.register_message_capture(PREFIX, _on_capture)
	# Announce readiness so the editor side knows the endpoint is live this session.
	EngineDebugger.send_message("%s:ready" % PREFIX, [])


func _exit_tree() -> void:
	if EngineDebugger.is_active() and EngineDebugger.has_capture(PREFIX):
		EngineDebugger.unregister_message_capture(PREFIX)


## Callback for messages addressed "mcp_runtime:<msg>". The prefix is stripped, so
## `message` is just "<msg>". Return true if we recognized it. Replies are pushed
## back via send_message("mcp_runtime:<kind>", [...]) so the editor _capture sees them.
##
## Each request carries [payload_dict] as data[0]. Each reply carries a single
## result dict (or an {error:...} dict) so the editor side has one uniform shape.
func _on_capture(message: String, data: Array) -> bool:
	var payload: Dictionary = data[0] if (data.size() > 0 and data[0] is Dictionary) else {}
	match message:
		"ping":
			# SPIKE: prove the round-trip. Echo back whatever payload came in.
			var token = data[0] if data.size() > 0 else null
			EngineDebugger.send_message("%s:pong" % PREFIX, [token])
			return true
		"tree":
			_reply("tree", {"tree": _snapshot_tree()})
			return true
		"get_property":
			_reply("property", _do_get_property(payload))
			return true
		"set_property":
			_reply("property", _do_set_property(payload))
			return true
		"emit_signal":
			_reply("signal_result", _do_emit_signal(payload))
			return true
		"inject_input":
			# Inject input into the running game via Input.parse_input_event (proven in
			# the Step-1 spike to reach BOTH _input handlers AND is_action_pressed polling).
			# Async: tap releases on the NEXT frame, so the coroutine sends the reply itself.
			_do_inject_input(payload)
			return true
		_:
			# Unknown runtime message — not ours to handle.
			return false


# ── Runtime operations (executed inside the running game) ─────────────────────

func _resolve(node_path: String) -> Node:
	var root := get_tree().root
	return root.get_node_or_null(NodePath(node_path))


func _do_get_property(payload: Dictionary) -> Dictionary:
	var node := _resolve(str(payload.get("nodePath", "")))
	if node == null:
		return {"error": "Node not found: %s" % payload.get("nodePath", "")}
	var prop := str(payload.get("property", ""))
	return {"nodePath": payload.get("nodePath"), "property": prop, "value": McpRuntimeJson.to_json(node.get(prop))}


func _do_set_property(payload: Dictionary) -> Dictionary:
	var node := _resolve(str(payload.get("nodePath", "")))
	if node == null:
		return {"error": "Node not found: %s" % payload.get("nodePath", "")}
	var prop := str(payload.get("property", ""))
	var hint := McpRuntimeJson.type_name(typeof(node.get(prop)))
	var coerced = McpRuntimeJson.coerce(payload.get("value"), hint)
	if McpRuntimeJson.is_unsupported(coerced):
		return {"error": "Cannot coerce value to type '%s' for property '%s'." % [hint, prop]}
	node.set(prop, coerced)
	return {"nodePath": payload.get("nodePath"), "property": prop, "value": McpRuntimeJson.to_json(node.get(prop))}


func _do_emit_signal(payload: Dictionary) -> Dictionary:
	var node := _resolve(str(payload.get("nodePath", "")))
	if node == null:
		return {"error": "Node not found: %s" % payload.get("nodePath", "")}
	var sig := str(payload.get("signal", ""))
	if not node.has_signal(sig):
		return {"error": "Node has no signal '%s'." % sig}
	var args: Array = payload.get("args", []) if payload.get("args") is Array else []
	# emit_signal takes varargs; callv-style via callable for an arg array.
	node.callv("emit_signal", [sig] + args)
	return {"nodePath": payload.get("nodePath"), "signal": sig, "emitted": true, "argCount": args.size()}


## Maps a mouse-button token to a MouseButton enum. Callers check `.has()` before indexing.
const _MOUSE_BUTTONS := {
	"left": MOUSE_BUTTON_LEFT,
	"right": MOUSE_BUTTON_RIGHT,
	"middle": MOUSE_BUTTON_MIDDLE,
	"wheel_up": MOUSE_BUTTON_WHEEL_UP,
	"wheel_down": MOUSE_BUTTON_WHEEL_DOWN,
}


## Inject input into the running game. Three kinds: "action" (InputEventAction by
## InputMap name), "mouse_button" (click at a screen position), "mouse_motion"
## (move / drag). Every kind feeds Input.parse_input_event — proven in the Step-1
## spike to reach BOTH _input handlers AND is_action_pressed polling, where
## Input.action_press would bypass the event-handler half. `tap` releases on the
## NEXT frame so once-per-frame is_action_just_pressed / _gui_input checks see the
## press. Always replies via "input_result" with {injected,...} or {error}.
##
## Kept as one function with inline per-kind blocks (deletion test: the three kinds
## share only the parse_input_event call — no real ≥2-caller seam to extract).
func _do_inject_input(payload: Dictionary) -> void:
	var kind := str(payload.get("kind", ""))
	match kind:
		"action":
			await _inject_action(payload)
		"mouse_button":
			await _inject_mouse_button(payload)
		"mouse_motion":
			_inject_mouse_motion(payload)
		_:
			_reply("input_result", {"error": "Unknown input kind: '%s' (expected action/mouse_button/mouse_motion)." % kind})


func _inject_action(payload: Dictionary) -> void:
	var action := str(payload.get("action", ""))
	if action.is_empty():
		_reply("input_result", {"error": "kind:'action' requires a non-empty 'action'."})
		return
	if not InputMap.has_action(action):
		_reply("input_result", {"error": "Action not in runtime InputMap: %s" % action})
		return

	var tap := bool(payload.get("tap", false))
	var pressed := bool(payload.get("pressed", true))
	# Tool-side _validate already range-checks strength; clamp here too so a future
	# direct runtime caller (not via the tool) can't push an out-of-range value.
	var strength := clampf(float(payload.get("strength", 1.0)), 0.0, 1.0)

	var press := InputEventAction.new()
	press.action = action
	press.pressed = true if tap else pressed
	press.strength = strength
	Input.parse_input_event(press)

	if tap:
		await get_tree().process_frame
		var release := InputEventAction.new()
		release.action = action
		release.pressed = false
		Input.parse_input_event(release)

	_reply("input_result", {"injected": true, "kind": "action", "action": action, "tap": tap, "pressed": press.pressed, "strength": strength})


func _inject_mouse_button(payload: Dictionary) -> void:
	var pos := _to_vec2(payload.get("position"))
	if pos == null:
		_reply("input_result", {"error": "kind:'mouse_button' requires 'position':[x,y]."})
		return
	var token := str(payload.get("button", "left"))
	if not _MOUSE_BUTTONS.has(token):
		_reply("input_result", {"error": "Unknown mouse button: '%s'." % token})
		return

	var tap := bool(payload.get("tap", false))
	var pressed := bool(payload.get("pressed", true))
	var button: int = _MOUSE_BUTTONS[token]

	var press := InputEventMouseButton.new()
	press.position = pos
	press.global_position = pos
	press.button_index = button
	press.pressed = true if tap else pressed
	press.double_click = bool(payload.get("double_click", false))
	press.button_mask = (1 << (button - 1)) if press.pressed else 0
	Input.parse_input_event(press)

	if tap:
		await get_tree().process_frame
		var release := InputEventMouseButton.new()
		release.position = pos
		release.global_position = pos
		release.button_index = button
		release.pressed = false
		release.button_mask = 0
		Input.parse_input_event(release)

	_reply("input_result", {"injected": true, "kind": "mouse_button", "button": token, "position": [pos.x, pos.y], "tap": tap, "pressed": press.pressed})


func _inject_mouse_motion(payload: Dictionary) -> void:
	var pos := _to_vec2(payload.get("position"))
	if pos == null:
		_reply("input_result", {"error": "kind:'mouse_motion' requires 'position':[x,y]."})
		return
	var rel := _to_vec2(payload.get("relative"))
	if rel == null:
		rel = Vector2.ZERO

	var mask := 0
	var held = payload.get("buttons_held", [])
	if held is Array:
		for token in held:
			var t := str(token)
			if _MOUSE_BUTTONS.has(t):
				mask |= (1 << (int(_MOUSE_BUTTONS[t]) - 1))

	var motion := InputEventMouseMotion.new()
	motion.position = pos
	motion.global_position = pos
	motion.relative = rel
	motion.button_mask = mask
	Input.parse_input_event(motion)
	# Keep polled mouse position (get_viewport().get_mouse_position) consistent with
	# the event — parse_input_event alone does not update it.
	Input.warp_mouse(pos)

	_reply("input_result", {"injected": true, "kind": "mouse_motion", "position": [pos.x, pos.y], "relative": [rel.x, rel.y], "buttonMask": mask})


## Coerce a JSON [x, y] array to a Vector2; null if not a 2-element numeric array.
func _to_vec2(v) -> Variant:
	if v is Array and v.size() == 2:
		return Vector2(float(v[0]), float(v[1]))
	return null


func _reply(kind: String, result: Dictionary) -> void:
	EngineDebugger.send_message("%s:%s" % [PREFIX, kind], [result])


## Minimal live scene-tree snapshot (name/type/path), depth-first from the root.
## Bundle 4's runtime_tree builds on this; the spike only needs ping/pong, but a
## tree probe lets the spike also confirm real data crosses the channel.
func _snapshot_tree() -> Dictionary:
	var root := get_tree().root
	return _node_snapshot(root, root)


func _node_snapshot(node: Node, root: Node) -> Dictionary:
	var children: Array = []
	for child in node.get_children():
		children.append(_node_snapshot(child, root))
	return {
		"name": str(node.name),
		"type": node.get_class(),
		"path": str(root.get_path_to(node)) if node != root else ".",
		"children": children,
	}
