@tool
extends RefCounted
## Writes / erases the instance registry file the external MCP server reads to
## discover this editor: ~/.claude/godot-mcp/instances/<projectId>.json
##
## The file carries this editor's own binary path (OS.get_executable_path()) so
## the server's CLI surface can resolve `godot` without it being on PATH. The
## path is runtime-local state under the user's home — never committed.
##
## Project identity / language / render method come from the shared
## project_identity.gd so the registry and the capability descriptor never diverge.

const SUBDIR := "godot-mcp/instances"
const Identity := preload("res://addons/claude_mcp/capabilities/project_identity.gd")

var _file_path: String


func _instances_dir() -> String:
	# Anchor under the user's ~/.claude to match the server's
	# os.homedir()/.claude/godot-mcp.
	var home := OS.get_environment("USERPROFILE")
	if home.is_empty():
		home = OS.get_environment("HOME")
	return home.path_join(".claude").path_join(SUBDIR)


func write(port: int) -> void:
	var dir := _instances_dir()
	DirAccess.make_dir_recursive_absolute(dir)
	_file_path = dir.path_join(Identity.project_id() + ".json")

	var version := Engine.get_version_info()
	var entry := {
		"projectId": Identity.project_id(),
		"projectPath": ProjectSettings.globalize_path("res://"),
		"projectName": Identity.project_basename(),
		"godotVersion": str(version.get("string", "unknown")),
		"language": Identity.language(),
		"binaryPath": OS.get_executable_path(),
		"port": port,
		"pid": OS.get_process_id(),
		"startedAt": Time.get_datetime_string_from_system(true),
	}
	var f := FileAccess.open(_file_path, FileAccess.WRITE)
	if f == null:
		push_error("[claude_mcp] cannot write registry file: %s" % _file_path)
		return
	f.store_string(JSON.stringify(entry, "  "))
	f.close()


func erase() -> void:
	if not _file_path.is_empty() and FileAccess.file_exists(_file_path):
		DirAccess.remove_absolute(_file_path)
