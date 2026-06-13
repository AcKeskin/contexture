@tool
extends "res://addons/claude_mcp/tools/runtime_tool.gd"
## runtime_inject_input — drive the RUNNING game's input pipeline like a player (v3).
##
## Three kinds, discriminated on `kind`:
##   action       — InputEventAction by InputMap name (press/release/tap + analog strength)
##   mouse_button — InputEventMouseButton at a screen position (click/tap/double-click)
##   mouse_motion — InputEventMouseMotion (move / drag with held buttons)
##
## All feed Input.parse_input_event inside the running game — proven (Step-1 spike) to
## reach BOTH _input handlers AND is_action_pressed polling, where Input.action_press
## bypasses the event-handler half. `tap` releases on the NEXT frame so a once-per-frame
## is_action_just_pressed / _gui_input check is not missed.
##
## Requires a game launched THROUGH the editor (play_scene / F5 / F6); a run_project
## standalone launch has no debugger link and returns GameNotRunning. Editor-side
## validation (below) fails fast on a bad payload before it crosses the channel; the
## in-game endpoint is the authority for runtime facts (e.g. action-in-InputMap).

const _MOUSE_BUTTONS := ["left", "right", "middle", "wheel_up", "wheel_down"]


func tool_name() -> String:
	return "runtime_inject_input"


func description() -> String:
	return "Inject input into the running game to drive it like a player. kind:'action' presses an InputMap action (tap, or pressed:true/false, with analog strength); kind:'mouse_button' clicks at position:[x,y] (button left/right/middle/wheel_up/wheel_down, tap/double_click); kind:'mouse_motion' moves/drags the mouse (position:[x,y], relative:[dx,dy], buttons_held). Requires a game launched THROUGH the editor (play_scene, F5/F6); a run_project/standalone launch will NOT connect. Observe the effect with a follow-up runtime_get_property / runtime_tree."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["kind"],
		"properties": {
			"kind": {"type": "string", "description": "Input kind: 'action' | 'mouse_button' | 'mouse_motion'."},
			# action
			"action": {"type": "string", "description": "InputMap action name (kind=action)."},
			"pressed": {"type": "boolean", "description": "Press state (kind=action/mouse_button; omit when tap)."},
			"tap": {"type": "boolean", "description": "Convenience: press now + release next frame (kind=action/mouse_button)."},
			"strength": {"type": "number", "description": "Analog strength 0..1 for the pressed action event (default 1.0)."},
			# mouse (button + motion)
			"position": {"type": "array", "description": "Screen coordinates [x, y] (kind=mouse_button/mouse_motion)."},
			"button": {"type": "string", "description": "Mouse button: left|right|middle|wheel_up|wheel_down (kind=mouse_button, default left)."},
			"double_click": {"type": "boolean", "description": "Mark the event as a double-click (kind=mouse_button)."},
			# motion
			"relative": {"type": "array", "description": "Motion delta [dx, dy] (kind=mouse_motion)."},
			"buttons_held": {"type": "array", "description": "Buttons down during motion, for drag (kind=mouse_motion)."},
		},
	}


func runtime_message() -> String:
	return "inject_input"


func reply_kind() -> String:
	return "input_result"


## Editor-side fail-fast validation before the payload crosses the channel. Returns
## an error string, or "" when the shape is valid. Runtime facts the editor can't
## know (is the action in the *running game's* InputMap?) are left to the endpoint.
func _validate(params: Dictionary) -> String:
	var kind := str(params.get("kind", ""))
	match kind:
		"action":
			if str(params.get("action", "")).is_empty():
				return "kind:'action' requires a non-empty 'action'."
			if params.has("strength"):
				var s := float(params.get("strength"))
				if s < 0.0 or s > 1.0:
					return "'strength' must be between 0.0 and 1.0 (got %s)." % s
		"mouse_button":
			if not _is_vec2(params.get("position")):
				return "kind:'mouse_button' requires 'position':[x, y]."
			var btn := str(params.get("button", "left"))
			if not _MOUSE_BUTTONS.has(btn):
				return "Unknown mouse button '%s' (expected one of %s)." % [btn, ", ".join(_MOUSE_BUTTONS)]
		"mouse_motion":
			if not _is_vec2(params.get("position")):
				return "kind:'mouse_motion' requires 'position':[x, y]."
			if params.has("relative") and not _is_vec2(params.get("relative")):
				return "'relative' must be [dx, dy] when present."
			var held = params.get("buttons_held", [])
			if not (held is Array):
				return "'buttons_held' must be an array of button tokens."
			for t in held:
				if not _MOUSE_BUTTONS.has(str(t)):
					return "Unknown button token in 'buttons_held': '%s'." % str(t)
		_:
			return "Unknown 'kind': '%s' (expected action/mouse_button/mouse_motion)." % kind
	return ""


func invoke(params: Dictionary, ctx: Dictionary):
	var problem := _validate(params)
	if not problem.is_empty():
		return err("InvalidInput", problem)
	return await super(params, ctx)


## Pass the normalized payload straight through — the endpoint's _do_inject_input
## reads kind + the per-kind fields. Validation already happened in invoke().
func build_payload(params: Dictionary) -> Dictionary:
	return params.duplicate(true)


func _is_vec2(v) -> bool:
	return v is Array and v.size() == 2
