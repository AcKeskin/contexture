@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## script_validate — parse-check a GDScript file and report errors.
##
## KNOWN GAP (deferred enhancement, not a hard limit) — GDScript per-line errors:
##   GDScript.reload(keep_state) drives the parser and returns a single Error
##   enum value (OK or an error code) with NO structured per-line data on this
##   path. So this tool returns line:-1 on failure.
##
##   The line numbers DO exist, though — windowed verification confirmed the
##   editor Output prints the real location (e.g. "...gd:4 - Parse Error: ...").
##   The diagnostics live in the editor's script-editor / parser channel; they
##   are simply not exposed to this plugin invoke path today. The open route to
##   real line numbers is the EditorInterface script-editor (or
##   GDScriptLanguageProtocol) — investigate that if/when line-level data is
##   wanted. Until then line:-1 is the honest signal, not a claim that the
##   information is unobtainable.
##
##   Result: this tool reliably returns {"valid": true/false}. On failure it
##   returns one synthetic error entry with line -1 and the raw error code.
##   To see per-line details now, open the script in the Godot editor — the
##   parser errors appear in the Output panel and the script editor gutter.
##
## C# scripts are out of scope: dotnet_build is the correct tool for those.
##
## is_mutation: false — reads only, no scene state is touched.

func tool_name() -> String:
	return "script_validate"


func description() -> String:
	return "Parse-check a GDScript (.gd) file and return valid:true/false plus best-effort error info. C# files are not validated here — use dotnet_build."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path"],
		"properties": {
			"path": {"type": "string", "description": "res:// path to the .gd (or .cs) script to validate."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, ctx: Dictionary):
	var path := str(params.get("path", ""))
	if path.is_empty():
		return err("InvalidInput", "'path' is required.")
	if not path.begins_with("res://"):
		return err("InvalidInput", "'path' must start with 'res://'. Got: %s" % path)

	# C# — out of scope for this tool.
	if path.ends_with(".cs"):
		return {
			"valid": null,
			"errors": [],
			"note": "C# validation is done by dotnet_build, not script_validate.",
		}

	if not path.ends_with(".gd"):
		return err("InvalidInput", "script_validate only supports .gd files. Got: %s" % path)

	if not ResourceLoader.exists(path):
		return err("InvalidInput", "No file found at: %s" % path)

	# Read source text so we can feed it to a fresh GDScript instance.
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return err("ToolError", "Could not open '%s' for reading. Error: %s" % [path, error_string(FileAccess.get_open_error())])
	var source := f.get_as_text()
	f.close()

	# Parse via a throw-away GDScript instance. reload(true) runs the parser
	# without executing the script (keep_state = true preserves existing
	# instances if any). Returns OK on success, non-zero on parse failure.
	var gd := GDScript.new()
	gd.source_code = source
	var result := gd.reload(true)

	if result == OK:
		return {"valid": true, "errors": []}

	# reload() gave us a non-OK code but no structured per-line data.
	# Return a single synthetic entry so callers get a machine-readable signal.
	# The editor Output panel will contain the real line-numbered diagnostics.
	return {
		"valid": false,
		"errors": [
			{
				"line": -1,
				"message": (
					"Parse failed (error code %d: %s). Open the script in the Godot editor for line-level details."
					% [result, error_string(result)]
				),
			}
		],
	}
