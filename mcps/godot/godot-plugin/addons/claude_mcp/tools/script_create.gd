@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## script_create — write a new script file to the project filesystem.
##
## Writes a minimal template to the given res:// path without attaching it to
## any node. Use script_attach afterward to attach. Supports GDScript (.gd) and
## C# (.cs). The file is written via FileAccess; the resource filesystem is
## refreshed so the file appears in the editor immediately.
##
## is_mutation: false — no scene state is touched.

func tool_name() -> String:
	return "script_create"


func description() -> String:
	return "Write a minimal script template to a res:// path. Does not attach the script to any node."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["path"],
		"properties": {
			"path": {"type": "string", "description": "res:// path for the new script, e.g. 'res://player.gd' or 'res://Player.cs'."},
			"baseClass": {"type": "string", "description": "Godot class to extend / inherit. Defaults to 'Node'."},
			"language": {"type": "string", "enum": ["gdscript", "csharp"], "description": "'gdscript' (default) or 'csharp'."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, ctx: Dictionary):
	var path := str(params.get("path", ""))
	if not path.begins_with("res://"):
		return err("InvalidInput", "'path' must start with 'res://'. Got: %s" % path)

	var base_class := str(params.get("baseClass", "Node"))
	if base_class.is_empty():
		base_class = "Node"

	var language := str(params.get("language", "gdscript")).to_lower()
	if language not in ["gdscript", "csharp"]:
		return err("InvalidInput", "'language' must be 'gdscript' or 'csharp'. Got: %s" % language)

	var content := ""
	if language == "gdscript":
		content = "extends %s\n\n\nfunc _ready() -> void:\n\tpass\n" % base_class
	else:
		# Derive a PascalCase class name from the file basename (no extension).
		var basename := path.get_file().get_basename()
		var class_name_str := _to_pascal_case(basename)
		content = (
			"using Godot;\n\npublic partial class %s : %s\n{\n    public override void _Ready()\n    {\n    }\n}\n"
			% [class_name_str, base_class]
		)

	var write_err := write_text_file(path, content)
	if not write_err.is_empty():
		return write_err

	return {"created": true, "path": path, "language": language}


# ── Helpers ──────────────────────────────────────────────────────────────────

## Convert a snake_case or kebab-case or already-PascalCase basename to PascalCase.
## "player_controller" → "PlayerController", "Player" → "Player".
func _to_pascal_case(s: String) -> String:
	if s.is_empty():
		return "MyScript"
	var parts := s.replace("-", "_").split("_")
	var out := ""
	for part in parts:
		if part.is_empty():
			continue
		out += part[0].to_upper() + part.substr(1)
	return out if not out.is_empty() else "MyScript"
