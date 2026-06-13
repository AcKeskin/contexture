@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## input_map_remove — remove an InputMap action from both runtime and project.godot.
##
## Two-phase delete:
##   1. Runtime: InputMap.erase_action so the action stops working immediately.
##   2. Persistence: ProjectSettings entry "input/<action>" set to null and saved
##      so the action does not reappear on next engine reload.
##
## NOTE: writes directly to project.godot — NOT undoable via Ctrl+Z.


func tool_name() -> String:
	return "input_map_remove"


func description() -> String:
	return "Remove an InputMap action by name. Removes it from the runtime InputMap and from project.godot immediately. NOT undoable."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["action"],
		"properties": {
			"action": {"type": "string", "description": "Action name to remove, e.g. 'player_jump'."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var action := str(params.get("action", ""))
	if action.is_empty():
		return err("InvalidInput", "Parameter 'action' is required.")
	if not InputMap.has_action(action):
		return err("InvalidInput", "No InputMap action named '" + action + "'.")

	# ── Runtime removal ─────────────────────────────────────────────────────
	InputMap.erase_action(action)

	# ── Persistence removal ─────────────────────────────────────────────────
	# Setting a key to null in ProjectSettings clears that entry on next save.
	if ProjectSettings.has_setting("input/" + action):
		ProjectSettings.set_setting("input/" + action, null)
	var e := ProjectSettings.save()
	if e != OK:
		return err("ToolError", "ProjectSettings.save() failed with error code " + str(e) + ".")

	return {
		"removed": true,
		"action": action,
	}
