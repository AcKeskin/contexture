@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## input_map_add — add (or replace) an InputMap action and persist it to project.godot.
##
## Two-phase write:
##   1. Runtime: InputMap.add_action / action_add_event so the action works
##      immediately in the running editor without a reload.
##   2. Persistence: ProjectSettings.set_setting("input/<action>", {...}) +
##      ProjectSettings.save() so the action survives engine restart.
##
## Idempotent: if the action already exists its existing events are cleared before
## the new events are added, so repeated calls converge to the supplied spec.
##
## NOTE: writes directly to project.godot — NOT undoable via Ctrl+Z.


func tool_name() -> String:
	return "input_map_add"


func description() -> String:
	return "Add or replace an InputMap action with the supplied events. Persists to project.godot immediately. NOT undoable. Event spec: {type:'key',keycode:<int>}, {type:'mouse_button',button:<int>}, {type:'joypad_button',button:<int>}."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["action", "events"],
		"properties": {
			"action": {"type": "string", "description": "Action name, e.g. 'player_jump'."},
			"events": {
				"type": "array",
				"description": "List of event specs. Each has a 'type' field ('key', 'mouse_button', 'joypad_button').",
				"items": {"type": "object"},
			},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var action := str(params.get("action", ""))
	if action.is_empty():
		return err("InvalidInput", "Parameter 'action' is required.")

	var raw_events = params.get("events", null)
	if raw_events == null or not raw_events is Array:
		return err("InvalidInput", "Parameter 'events' must be an array.")

	# ── Runtime update ──────────────────────────────────────────────────────
	if InputMap.has_action(action):
		InputMap.action_erase_events(action)
	else:
		InputMap.add_action(action)

	var built_events: Array = []
	for i in range(raw_events.size()):
		var spec = raw_events[i]
		if not spec is Dictionary:
			return err("InvalidInput", "Event at index " + str(i) + " must be a Dictionary.")
		var ev = _build_event(spec)
		if ev == null:
			return err("InvalidInput",
				"Event at index " + str(i) + " has unknown or missing 'type': " +
				str(spec.get("type", "<missing>")) + ".")
		InputMap.action_add_event(action, ev)
		built_events.append(ev)

	# ── Persistence ─────────────────────────────────────────────────────────
	# project.godot stores input actions as:
	#   [input]
	#   <action> = {"deadzone": 0.5, "events": [InputEventKey resource, ...]}
	# Setting a Dictionary that contains actual InputEvent objects (not dicts)
	# is the format ProjectSettings.save() serialises to the [input] section.
	var persist_events: Array = []
	for ev in built_events:
		persist_events.append(ev)

	ProjectSettings.set_setting("input/" + action, {
		"deadzone": 0.5,
		"events": persist_events,
	})
	var e := ProjectSettings.save()
	if e != OK:
		return err("ToolError", "ProjectSettings.save() failed with error code " + str(e) + ".")

	return {
		"added": true,
		"action": action,
		"eventCount": built_events.size(),
	}


func _build_event(spec: Dictionary):
	var t := str(spec.get("type", ""))
	match t:
		"key":
			var ev := InputEventKey.new()
			ev.keycode = int(spec.get("keycode", 0))
			if spec.has("physical") and bool(spec.get("physical", false)):
				ev.physical_keycode = int(spec.get("keycode", 0))
			return ev
		"mouse_button":
			var ev := InputEventMouseButton.new()
			ev.button_index = int(spec.get("button", 0))
			return ev
		"joypad_button":
			var ev := InputEventJoypadButton.new()
			ev.button_index = int(spec.get("button", 0))
			return ev
	return null
