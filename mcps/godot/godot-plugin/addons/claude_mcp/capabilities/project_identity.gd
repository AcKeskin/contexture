@tool
extends RefCounted
## Single source of truth for project identity + environment detection.
##
## Both the registry writer (instances/<id>.json) and the capability descriptor
## need the same project id, language, render method, and name. Computing them
## in one place prevents the two from ever diverging (e.g. registry says
## "gdscript" while the descriptor says "csharp").


## Project display name from project settings.
static func project_basename() -> String:
	return str(ProjectSettings.get_setting("application/config/name", "Project"))


## Stable per-project id: sanitized name + short hash of the absolute path.
static func project_id() -> String:
	var safe := project_basename().strip_edges().replace(" ", "_")
	var re := RegEx.new()
	re.compile("[^A-Za-z0-9_\\-]")
	safe = re.sub(safe, "", true)
	if safe.is_empty():
		safe = "Project"
	var abs_path := ProjectSettings.globalize_path("res://")
	var hash_hex := str(abs_path.hash()).sha256_text().substr(0, 6)
	return "%s@%s" % [safe, hash_hex]


## Normalize to the schema's three render-method literals.
static func render_method() -> String:
	var m := str(ProjectSettings.get_setting(
		"rendering/renderer/rendering_method", "forward_plus"))
	match m:
		"forward_plus", "mobile", "gl_compatibility":
			return m
		_:
			return "forward_plus"


## "csharp" if a .csproj is present or [dotnet] is configured, else "gdscript".
static func language() -> String:
	var dir := DirAccess.open("res://")
	if dir != null:
		for f in dir.get_files():
			if f.ends_with(".csproj"):
				return "csharp"
	if ProjectSettings.has_setting("dotnet/project/assembly_name"):
		return "csharp"
	return "gdscript"
