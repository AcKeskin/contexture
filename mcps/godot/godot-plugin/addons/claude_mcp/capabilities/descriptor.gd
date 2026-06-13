@tool
extends RefCounted
## Builds the capability descriptor the external MCP server reads on connect.
## Shape MUST match CapabilityDescriptorSchema in server/src/envelope.ts.
##
## The server registers MCP tools dynamically from `tools[]` — it hardcodes no
## tool names. v1 populates what it can detect; openxr/testRunner are null until
## v2 adds their tools.

const ToolRegistry := preload("res://addons/claude_mcp/tools/tool_registry.gd")
const Identity := preload("res://addons/claude_mcp/capabilities/project_identity.gd")


func build(registry: ToolRegistry, port: int) -> Dictionary:
	var version := Engine.get_version_info()
	return {
		"schemaVersion": 1,
		"godotVersion": str(version.get("string", "unknown")),
		"projectId": Identity.project_id(),
		"projectName": Identity.project_basename(),
		"projectPath": ProjectSettings.globalize_path("res://"),
		"renderMethod": Identity.render_method(),
		"language": Identity.language(),
		"binaryPath": OS.get_executable_path(),
		"port": port,
		"pid": OS.get_process_id(),
		"openxr": null, # v2: { version, runtime }
		"testRunner": _test_runner(), # null at v1 unless an addon is present
		"tools": registry.describe_tools(),
	}


## v1: detect a known test-runner addon if present; else null.
func _test_runner():
	if DirAccess.dir_exists_absolute("res://addons/gut"):
		return "gut"
	if DirAccess.dir_exists_absolute("res://addons/gdUnit4"):
		return "gdunit4"
	return null
