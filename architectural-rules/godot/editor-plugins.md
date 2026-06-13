---
name: Editor plugins
description: Main-thread _process polling, direct editor-viewport capture, large WS buffers, windowed validation, backups outside res://
type: user
kind: architectural-rule
scope: [godot, editor-tooling]
relevance: when-engine-godot
origin: shipped
---

<!-- id: process-is-main-thread --> A socket/server polled inside a Node's `_process()` runs on the editor MAIN thread (`Thread.is_main_thread()` is true). EditorInterface calls from there need NO `call_deferred` or cross-thread marshalling. Poll editor-facing work on `_process` to stay main-thread-safe by construction.
<!-- id: no-frame-post-draw-await --> Do NOT `await RenderingServer.frame_post_draw` to force a frame before capturing an EDITOR viewport — that signal does not fire predictably for the editor's own viewports and the coroutine hangs. Read `viewport.get_texture().get_image()` directly; editor viewports render continuously, so the latest frame is already available.
<!-- id: ws-buffers-before-accept --> Set `WebSocketPeer.inbound_buffer_size` and `outbound_buffer_size` large (e.g. 16 MB) BEFORE calling `accept_stream()`. The default (~64 KB) is too small for large payloads (e.g. base64 viewport PNGs); a big send fails with `ERR_OUT_OF_MEMORY`. Buffer sizing after accept_stream is too late.
<!-- id: validate-windowed --> Validate editor-plugin tools that render or push large payloads in a WINDOWED editor, not `--headless`. Headless has no render surface (cannot verify viewport capture) and masks WebSocket buffer limits (there is no large payload to send). Headless is fine ONLY for parse-checks, registry writes, and socket round-trips.
<!-- id: backups-outside-res --> Keep any plugin backup/old copy OUTSIDE `res://`. An in-tree backup collides `class_name` with the live copy ("Class X hides a global script class") and breaks the entire plugin load; it also pollutes `.godot/global_script_class_cache.cfg` and `uid_cache.bin`, which survive restart. If already hit, move the backup out and clear those caches.

**Why:** Editor tooling runs in a different execution context than game runtime: `_process` is main-thread, editor viewports render continuously (so frame-await semantics differ), and the editor enforces global `class_name` uniqueness across every script in `res://`. Each rule encodes a failure mode that does not surface until the specific seam is hit — a hung capture coroutine, an `ERR_OUT_OF_MEMORY` send, a headless run that "passes" while masking a buffer bug, or a backup copy that breaks plugin load engine-wide. Source: in-house editor-tooling experience, consistent with Godot docs — EditorPlugin / RenderingServer / WebSocketPeer.
