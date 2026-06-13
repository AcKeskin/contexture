@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## input_map_list — enumerate all InputMap actions and their bound events.
##
## Each action includes a "builtin" flag (true when the name starts with "ui_")
## so callers can filter engine-reserved actions from project actions.
## Event serialization covers Key, MouseButton, and JoypadButton events;
## all others serialize as {"type":"other","class":<ClassName>}.


func tool_name() -> String:
	return "input_map_list"


func description() -> String:
	return "List all InputMap actions with their events and deadzone. Each action carries a 'builtin' flag (true for 'ui_*' actions). Events include keys, mouse buttons, and joypad buttons."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"properties": {},
	}


func is_mutation() -> bool:
	return false


func invoke(_params: Dictionary, _ctx: Dictionary):
	var actions: Array = []
	for action in InputMap.get_actions():
		var action_name := str(action)
		var events: Array = []
		for ev in InputMap.action_get_events(action):
			events.append(_serialize_event(ev))
		actions.append({
			"name": action_name,
			"deadzone": InputMap.action_get_deadzone(action),
			"builtin": action_name.begins_with("ui_"),
			"events": events,
		})
	return {"actions": actions}


func _serialize_event(ev: InputEvent) -> Dictionary:
	if ev is InputEventKey:
		return {
			"type": "key",
			"keycode": ev.keycode,
			"physical": ev.physical_keycode != 0,
		}
	if ev is InputEventMouseButton:
		return {
			"type": "mouse_button",
			"button": ev.button_index,
		}
	if ev is InputEventJoypadButton:
		return {
			"type": "joypad_button",
			"button": ev.button_index,
		}
	return {
		"type": "other",
		"class": ev.get_class(),
	}
