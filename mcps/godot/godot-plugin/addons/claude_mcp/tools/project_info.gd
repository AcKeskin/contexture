@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## project_info — returns the capability descriptor for the open project.
## Mirrors the descriptor the server fetches via the "capabilities" meta-request,
## but exposed as a normal tool so it appears in the MCP surface.

const Descriptor := preload("res://addons/claude_mcp/capabilities/descriptor.gd")


func tool_name() -> String:
	return "project_info"


func description() -> String:
	return "Return the Godot project's capability descriptor: version, language (gdscript/csharp), render method, project paths, port, and binary path."


func invoke(_params: Dictionary, ctx: Dictionary):
	# The dispatcher supplies the registry + bound port through ctx so this
	# handler does not need to reach back into the plugin.
	return Descriptor.new().build(ctx.get("registry"), int(ctx.get("port", 0)))
