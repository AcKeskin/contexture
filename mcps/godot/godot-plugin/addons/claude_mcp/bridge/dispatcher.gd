@tool
extends RefCounted
## Dispatches a parsed request envelope to a tool handler and builds the
## response envelope.
##
## Threading note: the socket server polls inside Node._process(), which runs on
## the editor MAIN THREAD (Thread.is_main_thread() == true there). EditorInterface
## calls are therefore already main-thread-safe — no call_deferred / cross-thread
## marshalling is needed. (This is the resolution of the plan's Open Q #1: host the
## socket on a _process tick rather than a background thread, and dispatch inline.)
##
## The one real safety requirement remains: scene mutations must go through
## EditorUndoRedoManager so they are undoable and don't corrupt editor state.
## Mutating handlers (is_mutation() == true) are wrapped here, centrally.

const McpTool := preload("res://addons/claude_mcp/tools/mcp_tool.gd")
const ToolRegistry := preload("res://addons/claude_mcp/tools/tool_registry.gd")

var _registry: ToolRegistry
var _plugin: EditorPlugin
var _runtime = null # McpRuntimeDebuggerPlugin (Bundle 4) or null
var _port := 0


func configure(registry: ToolRegistry, plugin: EditorPlugin, runtime_debugger = null) -> void:
	_registry = registry
	_plugin = plugin
	_runtime = runtime_debugger


func set_port(port: int) -> void:
	_port = port


## request: { "tool": String, "params": Dictionary, "correlationId": String }
## Returns a fully-formed response envelope Dictionary.
func dispatch(request: Dictionary) -> Dictionary:
	var cid := str(request.get("correlationId", ""))
	var tool_name := str(request.get("tool", ""))
	var params: Dictionary = request.get("params", {})

	if not _registry.has(tool_name):
		return _error(cid, "ToolNotFound", "No handler named '%s'." % tool_name)

	var handler: McpTool = _registry.get_handler(tool_name)
	var ctx := {
		"plugin": _plugin,
		"correlationId": cid,
		"registry": _registry,
		"port": _port,
		"runtime": _runtime, # Bundle 4 runtime channel (null if not wired)
	}

	# `await` is safe for both sync and coroutine handlers: awaiting a plain
	# return value passes it straight through; awaiting a coroutine (e.g. view's
	# frame_post_draw) suspends until it resolves. This keeps one dispatch path.
	var result
	if handler.is_mutation():
		result = await _invoke_undoable(handler, params, ctx)
	else:
		result = await handler.invoke(params, ctx)

	return _envelope(cid, result)


## Wrap a mutating handler in a single undoable action.
func _invoke_undoable(handler: McpTool, params: Dictionary, ctx: Dictionary):
	var undo := _plugin.get_undo_redo() # EditorUndoRedoManager
	undo.create_action("MCP: %s" % handler.tool_name())
	ctx["undo"] = undo
	var result = await handler.invoke(params, ctx)
	# If the handler reported an error, abort the action rather than commit it.
	if result is Dictionary and result.get("__mcp_error__", false):
		undo.commit_action(false) # commit without executing do-methods
		return result
	undo.commit_action()
	return result


# ── Envelope construction ────────────────────────────────────────────────────

func _envelope(cid: String, result) -> Dictionary:
	if result is Dictionary and result.get("__mcp_error__", false):
		var body := {"code": result["code"], "message": result["message"]}
		if result.has("details"):
			body["details"] = result["details"]
		return {"ok": false, "error": body, "correlationId": cid}
	if result is Dictionary and result.get("__mcp_png__", false):
		return {
			"ok": true,
			"result": {"contentType": "image/png", "data": result["data"]},
			"correlationId": cid,
		}
	return {
		"ok": true,
		"result": {"contentType": "application/json", "data": result},
		"correlationId": cid,
	}


func _error(cid: String, code: String, message: String) -> Dictionary:
	return {
		"ok": false,
		"error": {"code": code, "message": message},
		"correlationId": cid,
	}
