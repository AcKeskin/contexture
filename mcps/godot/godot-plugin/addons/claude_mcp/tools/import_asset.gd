@tool
extends "res://addons/claude_mcp/tools/mcp_tool.gd"
## import_asset — bring an external image file into res:// and import it.
##
## The asset-ingestion seam for a content-driven game. An external art tool
## (ComfyUI, later, via its own MCP) drops image files into a drop folder; this
## tool copies one into res:// and drives the editor's import pipeline so the file
## becomes a load()-able Texture2D — no manual editor rescan.
##
## Reimport is DEFERRED (spike finding, plan content-pipeline v1 Step 1): in Godot
## 4.6.3 reimport_files() writes the .import sidecar with valid=false synchronously
## but the actual texture compile (.ctex) runs on a later editor tick. A load() in
## the same synchronous handler call returns null. So this handler is a COROUTINE:
## after reimport_files() it awaits resources_reimported (bounded by a process-frame
## poll fallback) and confirms load() resolves to a Texture2D before returning. The
## dispatcher awaits handlers, so a coroutine return is supported.
##
## is_mutation: false — touches the project filesystem, not editor scene state.

## Image extensions this bundle ingests. Allowlist — fail-closed (mirrors
## script_edit's posture). Other asset types (audio/font/model) are a later bundle.
const _IMAGE_EXTS := ["png", "jpg", "jpeg", "webp", "svg", "bmp"]

## Default drop folder under the project root. The future ComfyUI MCP writes here.
const _DEFAULT_DROP_DIR := "comfy_out"

## Bounded wait for the deferred import (process frames). At ~60fps this is ~2s —
## generous for a single small texture; a real failure surfaces as a timeout error
## rather than a hang.
const _MAX_IMPORT_FRAMES := 120


func tool_name() -> String:
	return "import_asset"


func description() -> String:
	return "Copy an image file from a drop folder into res:// and import it so it loads as a Texture2D (no manual rescan). Source from 'dropDir' (default <project>/comfy_out). Image types only (png/jpg/jpeg/webp/svg/bmp). A missing source returns InvalidInput, never hangs."


func input_schema() -> Dictionary:
	return {
		"type": "object",
		"required": ["filename", "destPath"],
		"properties": {
			"filename": {"type": "string", "description": "File to pull from the drop folder, e.g. 'coin.png'."},
			"destPath": {"type": "string", "description": "res:// destination, e.g. 'res://art/icons/coin.png'."},
			"dropDir": {"type": "string", "description": "Absolute source folder. Defaults to '<project>/comfy_out'."},
			"createDirs": {"type": "boolean", "description": "Create missing parent dirs under res://. Defaults to true."},
		},
	}


func is_mutation() -> bool:
	return false


func invoke(params: Dictionary, _ctx: Dictionary):
	var filename := str(params.get("filename", ""))
	if filename.is_empty():
		return err("InvalidInput", "'filename' is required.")

	var dest := str(params.get("destPath", ""))
	if dest.is_empty():
		return err("InvalidInput", "'destPath' is required.")
	if not dest.begins_with("res://"):
		return err("InvalidInput", "'destPath' must start with 'res://'. Got: %s" % dest)
	if dest.begins_with(_PROTECTED_PREFIX):
		return err("InvalidInput", "Refusing to write under '%s' (the MCP plugin's own source)." % _PROTECTED_PREFIX)

	# Image-only allowlist — checked on the destination extension.
	var ext := dest.get_extension().to_lower()
	if ext.is_empty():
		return err("InvalidInput", "'destPath' has no file extension. Got: %s" % dest)
	if not (ext in _IMAGE_EXTS):
		return err("InvalidInput", "import_asset ingests image types %s; '%s' is not allowed. Got: %s" % [_IMAGE_EXTS, ext, dest])

	# Resolve the source file under the drop folder.
	var drop_dir := str(params.get("dropDir", ""))
	if drop_dir.is_empty():
		drop_dir = ProjectSettings.globalize_path("res://").path_join(_DEFAULT_DROP_DIR)
	var src_abs := drop_dir.path_join(filename)
	if not FileAccess.file_exists(src_abs):
		return err("InvalidInput", "Source file not found: %s (looked in dropDir '%s')." % [src_abs, drop_dir])

	# Copy bytes to the res:// destination (binary, not text). The helper returns the
	# byte count on success, so we don't re-read the file just to size it.
	var create_dirs := bool(params.get("createDirs", true))
	var copy_result := copy_binary_file(src_abs, dest, create_dirs)
	if copy_result.get("__mcp_error__", false):
		return copy_result
	var byte_count: int = copy_result.get("bytes", 0)

	# Drive the editor import pipeline. Two constraints shape this:
	#   1. Reimport is deferred — the texture isn't load()-able in the same call.
	#   2. Re-entrant reimport_files() is rejected by the engine ("reimport_files()
	#      recursively") because scan() already queues an auto-reimport for the new file.
	# Therefore we do NOT call scan()+reimport_files() here. We notify the editor of the
	# single changed file via update_file(), let its own filesystem tick run the
	# (de-duplicated) reimport, and poll load() over a bounded number of frames.
	var efs := EditorInterface.get_resource_filesystem()
	efs.update_file(dest)

	var tree := Engine.get_main_loop() as SceneTree
	var frames := 0
	while frames < _MAX_IMPORT_FRAMES:
		# Let the editor's filesystem tick run its own (de-duplicated) reimport.
		if tree != null:
			await tree.process_frame
		frames += 1
		# Don't probe while a scan is mid-flight — the resource isn't registered yet.
		if efs.is_scanning():
			continue
		var probe := ResourceLoader.load(dest, "", ResourceLoader.CACHE_MODE_REPLACE)
		if probe is Texture2D:
			return {
				"imported": true,
				"dest": dest,
				"bytes": byte_count,
				"importedAs": "Texture2D",
			}

	# Budget exhausted: the file copied but the import never resolved to a Texture2D.
	# Most likely the source is not a decodable image (corrupt / wrong bytes).
	return err("ToolError", "Imported bytes to '%s' but the editor did not produce a loadable Texture2D within %d frames. Check the source is a valid, decodable image (a CRC/IDAT error in the editor log means the PNG is corrupt)." % [dest, _MAX_IMPORT_FRAMES])
