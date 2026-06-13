@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## view — capture the editor 2D or 3D viewport as a PNG.
## Returns image content the agent can see (base64-encoded PNG inline).

func tool_name() -> String:
	return "view"


func description() -> String:
	return "Capture the editor's 2D or 3D viewport as a PNG image. mode: '2d' | '3d'."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["mode"],
		"properties": {
			"mode": {"type": "string", "enum": ["2d", "3d"], "description": "Which editor viewport to capture."},
		},
	}


func invoke(params: Dictionary, _ctx: Dictionary):
	var mode := str(params.get("mode", ""))

	# A headless editor has no rendering framebuffer; viewport capture is
	# impossible. Report it as a distinct, actionable condition rather than a
	# generic ToolError.
	if DisplayServer.get_name() == "headless":
		return err("ToolError",
			"view is unavailable in a headless editor (no rendering surface). " +
			"Run the editor with a window to capture the viewport.")

	var viewport: SubViewport = null
	match mode:
		"3d":
			viewport = EditorInterface.get_editor_viewport_3d(0)
		"2d":
			viewport = EditorInterface.get_editor_viewport_2d()
		_:
			return err("InvalidInput", "mode must be '2d' or '3d'.")

	if viewport == null:
		return err("ToolError", "Editor %s viewport unavailable." % mode)

	# The editor viewports render continuously, so the current texture is valid
	# to read directly. (An earlier `await RenderingServer.frame_post_draw` hung
	# the call: that signal does not fire on a predictable schedule for the
	# editor's own viewports, so the coroutine never resumed.)
	var tex := viewport.get_texture()
	if tex == null:
		return err("ToolError", "Viewport texture unavailable.")

	var image := tex.get_image()
	if image == null:
		return err("ToolError", "Could not read viewport image.")

	var png_bytes := image.save_png_to_buffer()
	if png_bytes.is_empty():
		return err("ToolError", "PNG encode produced no bytes.")

	return png(Marshalls.raw_to_base64(png_bytes))
