@tool
extends Node
## WebSocket bridge host. A Node so its _process() ticks on the editor main loop
## (main thread) — see dispatcher.gd's threading note.
##
## Listens on 127.0.0.1:<os-assigned> via TCPServer, upgrades accepted streams to
## WebSocketPeer, and on each text message: parses the request envelope, dispatches
## it (synchronously, main thread), and writes the response envelope back.
##
## v1 handles one client at a time (single MCP server). The "capabilities" request
## is answered from the descriptor; everything else routes to a tool handler.

const Dispatcher := preload("res://addons/claude_mcp/bridge/dispatcher.gd")
const Descriptor := preload("res://addons/claude_mcp/capabilities/descriptor.gd")
const ToolRegistry := preload("res://addons/claude_mcp/tools/tool_registry.gd")

const BIND_ADDR := "127.0.0.1"
const MAX_BUFFER := 16 * 1024 * 1024 # 16 MB — fits large base64 viewport PNGs

var _tcp := TCPServer.new()
var _peer: WebSocketPeer = null
var _port := 0
var _dispatcher: Dispatcher
var _descriptor: Descriptor
var _registry: ToolRegistry


## `runtime_debugger` is the Bundle 4 EditorDebuggerPlugin (or null if runtime
## tools aren't wired) — passed through to the dispatcher so runtime_* tools can
## reach the live game via ctx["runtime"].
func configure(registry: ToolRegistry, plugin: EditorPlugin, runtime_debugger = null) -> void:
	_registry = registry
	_dispatcher = Dispatcher.new()
	_dispatcher.configure(registry, plugin, runtime_debugger)
	_descriptor = Descriptor.new()


## Bind an OS-assigned port (port 0). Returns the actual bound port.
func start() -> int:
	var err := _tcp.listen(0, BIND_ADDR)
	if err != OK:
		push_error("[claude_mcp] TCP listen failed: %d" % err)
		return 0
	_port = _tcp.get_local_port()
	_dispatcher.set_port(_port)
	return _port


func stop() -> void:
	if _peer != null:
		_peer.close()
		_peer = null
	if _tcp.is_listening():
		_tcp.stop()


func _process(_delta: float) -> void:
	# Accept one pending connection (single-client v1).
	if _peer == null and _tcp.is_connection_available():
		var stream := _tcp.take_connection()
		if stream != null:
			_peer = WebSocketPeer.new()
			# Default buffers (~64 KB) are far too small for view's base64 PNGs —
			# a large send fails with ERR_OUT_OF_MEMORY (wsl_peer.cpp). Size both
			# buffers generously (16 MB) so viewport captures fit in one message.
			_peer.inbound_buffer_size = MAX_BUFFER
			_peer.outbound_buffer_size = MAX_BUFFER
			_peer.max_queued_packets = 64
			_peer.accept_stream(stream)

	if _peer == null:
		return

	_peer.poll()
	var state := _peer.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		while _peer.get_available_packet_count() > 0:
			_handle_packet(_peer.get_packet())
	elif state == WebSocketPeer.STATE_CLOSED:
		_peer = null # client gone; ready for the next connection


func _handle_packet(bytes: PackedByteArray) -> void:
	var text := bytes.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		_send({
			"ok": false,
			"error": {"code": "InvalidInput", "message": "Request was not a JSON object."},
			"correlationId": "",
		})
		return

	var request: Dictionary = parsed
	var cid := str(request.get("correlationId", ""))
	var tool := str(request.get("tool", ""))

	# Reserved meta-tool: capability descriptor.
	if tool == "capabilities":
		_send({
			"ok": true,
			"result": {"contentType": "application/json",
				"data": _descriptor.build(_registry, _port)},
			"correlationId": cid,
		})
		return

	_send(await _dispatcher.dispatch(request))


func _send(envelope: Dictionary) -> void:
	if _peer != null and _peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_peer.send_text(JSON.stringify(envelope))
