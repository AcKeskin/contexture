@tool
extends RefCounted
class_name McpTool
## Base class for socket-surface tool handlers.
##
## A handler declares its advertised shape (name / description / input schema /
## surface) and implements `invoke`. Mutating handlers set `is_mutation = true`
## so the dispatcher wraps the call in EditorUndoRedoManager (see main_thread.gd).
##
## `invoke` returns a Dictionary result body that becomes the envelope's
## `result.data`. To signal a tool-level error, return McpTool.err(code, message).
## To return an image, return McpTool.png(base64_string).

## Writes anywhere under this prefix are refused by file-writing handlers — a tool
## must not edit the MCP bridge that serves it. Shared by script_edit and
## import_asset. (Trailing slash matters: blocks the dir, not a sibling file.)
const _PROTECTED_PREFIX := "res://addons/claude_mcp/"


## Override in subclasses.
func tool_name() -> String:
	return ""


func description() -> String:
	return ""


## JSON-Schema object describing params. Default: no params.
func input_schema() -> Dictionary:
	return {"type": "object", "properties": {}}


## "socket" for live-editor handlers. CLI tools are advertised separately.
func surface() -> String:
	return "socket"


## True if the handler mutates editor scene state (→ undo-wrapped).
func is_mutation() -> bool:
	return false


## ctx is a Dictionary: { "plugin": EditorPlugin, "correlationId": String }.
## Return either a plain result Dictionary, or one built via err()/png().
func invoke(_params: Dictionary, _ctx: Dictionary):
	return err("ToolError", "not implemented")


# ── Result builders ─────────────────────────────────────────────────────────

## Tool-level error. Dispatcher turns this into an `ok:false` envelope.
static func err(code: String, message: String, details = null) -> Dictionary:
	var e := {"__mcp_error__": true, "code": code, "message": message}
	if details != null:
		e["details"] = details
	return e


## Image result. `base64` is the PNG bytes, base64-encoded.
static func png(base64: String) -> Dictionary:
	return {"__mcp_png__": true, "data": base64}


# ── Filesystem helpers ──────────────────────────────────────────────────────

## Write UTF-8 text to a res:// path and refresh the editor filesystem so the
## file appears without a manual rescan. Shared by script_create (template) and
## script_edit (full content). Optionally creates missing parent directories.
##
## Returns an empty Dictionary on success, or an err(...) Dictionary on failure —
## callers do `var e := write_text_file(...); if not e.is_empty(): return e`.
## Caller is responsible for path validation (res:// prefix, extension policy)
## BEFORE calling; this helper only performs the write.
static func write_text_file(path: String, content: String, create_dirs: bool = false) -> Dictionary:
	if create_dirs:
		var dir_path := path.get_base_dir()
		var mkdir_err := DirAccess.make_dir_recursive_absolute(dir_path)
		if mkdir_err != OK and mkdir_err != ERR_ALREADY_EXISTS:
			return err("ToolError", "Could not create parent directory '%s'. Error: %s" % [dir_path, error_string(mkdir_err)])

	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return err("ToolError", "Could not open '%s' for writing. Error: %s" % [path, error_string(FileAccess.get_open_error())])

	f.store_string(content)
	f.close()

	# Notify the editor filesystem so the file shows up without a manual rescan.
	EditorInterface.get_resource_filesystem().scan()
	return {}


## Copy a binary file from an absolute source path to a res:// destination. The
## binary counterpart to write_text_file — used by import_asset to bring external
## image bytes into the project. Does NOT trigger an import (the caller drives the
## reimport pipeline, which for textures is deferred — see import_asset). Optionally
## creates missing parent directories.
##
## Returns {"bytes": <int>} on success, or an err(...) Dictionary on failure. Callers
## detect failure with result.get("__mcp_error__", false), and read the byte count
## from result["bytes"] on success — avoids a second full read just to size the file.
## Caller validates the dest path / extension policy BEFORE calling; this helper only
## performs the byte copy + a filesystem scan.
static func copy_binary_file(src_abs: String, dest: String, create_dirs: bool = false) -> Dictionary:
	if create_dirs:
		var dir_path := dest.get_base_dir()
		var mkdir_err := DirAccess.make_dir_recursive_absolute(dir_path)
		if mkdir_err != OK and mkdir_err != ERR_ALREADY_EXISTS:
			return err("ToolError", "Could not create parent directory '%s'. Error: %s" % [dir_path, error_string(mkdir_err)])

	var src := FileAccess.open(src_abs, FileAccess.READ)
	if src == null:
		return err("ToolError", "Could not open source '%s' for reading. Error: %s" % [src_abs, error_string(FileAccess.get_open_error())])
	var bytes := src.get_buffer(src.get_length())
	src.close()

	var out := FileAccess.open(dest, FileAccess.WRITE)
	if out == null:
		return err("ToolError", "Could not open '%s' for writing. Error: %s" % [dest, error_string(FileAccess.get_open_error())])
	out.store_buffer(bytes)
	out.close()

	# Notify the editor filesystem so the file appears without a manual rescan.
	EditorInterface.get_resource_filesystem().scan()
	return {"bytes": bytes.size()}
