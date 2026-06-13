@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## script_edit — write full source content to a script (or other text resource).
##
## Create-or-overwrite: writes the provided `content` verbatim to the given
## res:// path, creating the file if it does not exist and overwriting it if it
## does. This is the content-write counterpart to script_create (which only
## emits a minimal template); use script_edit when you have the full source.
##
## Primary lane is scripts (.gd / .cs); a curated set of other UTF-8 text
## resources is also writable (.tscn, .tres, .json, .cfg, .txt, .md, .csv,
## .gdshader). The extension policy is an ALLOWLIST, not a denylist: anything not
## explicitly listed is rejected. Fail-closed is the correct posture for a tool
## whose whole job is writing arbitrary caller-supplied bytes — a denylist would
## silently permit writing any unlisted text type, including binary formats we
## forgot to enumerate.
##
## The tool also refuses to write its own bridge: paths under
## res://addons/claude_mcp/ are rejected so a stray call can't brick the MCP
## plugin mid-session.
##
## Mirrors the ecosystem convention (GDAI's edit_script) and our own
## script_create's overwrite-freely behavior — no overwrite flag.
##
## is_mutation: false — touches the project filesystem, not editor scene state,
## so it is not undo-wrapped (consistent with script_create).

## Writable text extensions. Allowlist — anything not here is rejected. Scripts
## first, then the text resource/config/doc formats it's reasonable to author.
const _TEXT_EXTS := [
	"gd", "cs", "gdshader",            # scripts / shaders
	"tscn", "tres",                    # text scene / resource formats
	"json", "cfg", "ini", "csv", "txt", "md",  # config / data / docs
]

## _PROTECTED_PREFIX (the MCP-bridge write guard) is defined on the base McpTool —
## shared with import_asset so the prefix literal lives in one place.


func tool_name() -> String:
	return "script_edit"


func description() -> String:
	return "Write full source content to a res:// path (create-or-overwrite). Primary use is scripts (.gd/.cs); other UTF-8 text resources are allowed. Overwrites if the file exists. Use script_create for a minimal template instead."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path", "content"],
		"properties": {
			"path": {"type": "string", "description": "res:// path to write, e.g. 'res://scripts/Player.cs'."},
			"content": {"type": "string", "description": "Full source/text content to write verbatim. Overwrites any existing file."},
			"createDirs": {"type": "boolean", "description": "Create missing parent directories under res:// first. Defaults to true."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var path := str(params.get("path", ""))
	if path.is_empty():
		return err("InvalidInput", "'path' is required.")
	if not path.begins_with("res://"):
		return err("InvalidInput", "'path' must start with 'res://'. Got: %s" % path)

	# content is required but may legitimately be the empty string.
	if not params.has("content"):
		return err("InvalidInput", "'content' is required.")
	var content := str(params.get("content"))

	# Refuse to edit the MCP bridge that serves this very call.
	if path.begins_with(_PROTECTED_PREFIX):
		return err("InvalidInput", "Refusing to write under '%s' (the MCP plugin's own source). Got: %s" % [_PROTECTED_PREFIX, path])

	# Allowlist: only explicitly-listed text extensions are writable.
	var ext := path.get_extension().to_lower()
	if ext.is_empty():
		return err("InvalidInput", "'path' has no file extension; refusing to write an extension-less file. Got: %s" % path)
	if not (ext in _TEXT_EXTS):
		return err("InvalidInput", "script_edit only writes these text types %s; '%s' is not allowed. Got: %s" % [_TEXT_EXTS, ext, path])

	var existed := FileAccess.file_exists(path)

	var create_dirs := bool(params.get("createDirs", true))
	var write_err := write_text_file(path, content, create_dirs)
	if not write_err.is_empty():
		return write_err

	return {
		"written": true,
		"path": path,
		"created": not existed,
		"overwritten": existed,
		"bytes": content.to_utf8_buffer().size(),
	}
