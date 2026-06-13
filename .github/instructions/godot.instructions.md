---
applyTo: "**"
---

# godot rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/godot/` — do not hand-edit.

## C# in Godot

Expose inspector-editable fields with `[Export]` on a C# property/field, the binding equivalent of GDScript's `@export`. Plain C# fields are invisible to the editor. (Godot docs — C# basics)
Declare signals as `[Signal] public delegate void NameEventHandler(...)`. The generated event is the typed, editor-visible signal; ad-hoc C# events are not Godot signals. (Godot docs — C# basics)
Every C#↔engine call crosses a marshalling boundary with real per-call cost. Do not make many small cross-language calls per frame — batch work and cache values on the C# side. (Godot docs — C# API differences)
A `GodotObject` (Node, Resource) has engine-owned native lifetime that is independent of the C# GC. Free engine objects explicitly (`QueueFree`/`Free`); never assume the GC reclaims them, and never touch a C# wrapper after the native object is freed. (Godot docs — C# API differences)
Connect signals in C# with a `Callable` (e.g. `Connect(SignalName.X, Callable.From(handler))`), not a raw string method name. Callable-based connection is type-checked and refactor-safe. (Godot docs — C# basics)

Cross-reference: the universal C# rules under `csharp/` still apply — these add only the Godot-binding specifics on top of them.

**Why:** The C# binding sits over a native engine: the marshalling boundary and the GodotObject/GC lifetime split are the two seams where idiomatic C# assumptions break. Treating engine objects as GC-managed, or chattering across the boundary each frame, produces both correctness bugs (use-after-free) and frame-time regressions. Source: Godot docs — C# basics / C# API differences.

## Editor plugins

A socket/server polled inside a Node's `_process()` runs on the editor MAIN thread (`Thread.is_main_thread()` is true). EditorInterface calls from there need NO `call_deferred` or cross-thread marshalling. Poll editor-facing work on `_process` to stay main-thread-safe by construction.
Do NOT `await RenderingServer.frame_post_draw` to force a frame before capturing an EDITOR viewport — that signal does not fire predictably for the editor's own viewports and the coroutine hangs. Read `viewport.get_texture().get_image()` directly; editor viewports render continuously, so the latest frame is already available.
Set `WebSocketPeer.inbound_buffer_size` and `outbound_buffer_size` large (e.g. 16 MB) BEFORE calling `accept_stream()`. The default (~64 KB) is too small for large payloads (e.g. base64 viewport PNGs); a big send fails with `ERR_OUT_OF_MEMORY`. Buffer sizing after accept_stream is too late.
Validate editor-plugin tools that render or push large payloads in a WINDOWED editor, not `--headless`. Headless has no render surface (cannot verify viewport capture) and masks WebSocket buffer limits (there is no large payload to send). Headless is fine ONLY for parse-checks, registry writes, and socket round-trips.
Keep any plugin backup/old copy OUTSIDE `res://`. An in-tree backup collides `class_name` with the live copy ("Class X hides a global script class") and breaks the entire plugin load; it also pollutes `.godot/global_script_class_cache.cfg` and `uid_cache.bin`, which survive restart. If already hit, move the backup out and clear those caches.

**Why:** Editor tooling runs in a different execution context than game runtime: `_process` is main-thread, editor viewports render continuously (so frame-await semantics differ), and the editor enforces global `class_name` uniqueness across every script in `res://`. Each rule encodes a failure mode that does not surface until the specific seam is hit — a hung capture coroutine, an `ERR_OUT_OF_MEMORY` send, a headless run that "passes" while masking a buffer bug, or a backup copy that breaks plugin load engine-wide. Source: in-house editor-tooling experience, consistent with Godot docs — EditorPlugin / RenderingServer / WebSocketPeer.

## GDScript style

Annotate types: `var speed: int = 10`, `func move(dir: Vector2) -> void:`. Static hints give editor errors, autocompletion, and a small runtime speedup over untyped dynamic code. (Godot GDScript style guide)
snake_case for functions and variables, PascalCase for classes and node names, CONSTANT_CASE for constants and enum members. Follow the style guide's casing exactly — mixed casing breaks reader expectations. (Godot GDScript style guide)
At most one `class_name` per script, and it must be globally unique. A duplicate `class_name` triggers "Class X hides a global script class" and breaks load. (Godot GDScript style guide)
Prefer explicit typed access over dynamic patterns. Avoid `get()/set()`-by-string and `call()`-by-string when a direct typed call exists; reserve dynamic dispatch for cases that genuinely need it. (Godot GDScript style guide)

**Why:** GDScript is dynamically typed by default, so discipline is opt-in. Type hints, canonical naming, and unique `class_name`s are what make a GDScript codebase navigable, autocompletable, and free of the global-class-collision failures that silently break plugin and project loads. Source: Godot GDScript style guide.

## Nodes and scenes

Build behaviour by composing scenes and child nodes, not by deepening a node-class inheritance chain. Reusable behaviour goes in its own scene instanced where needed. (Godot docs — Scene organization)
Cache child-node references with `@onready var x := $Path` (or `%UniqueName`), not by calling `get_node` repeatedly each frame. @onready resolves once after the tree is ready. (Godot docs — Nodes and scenes)
Never reach across the tree with brittle relative paths like `get_node("../../Other")`. Expose an `@export var target: NodePath` and resolve it, or use scene-unique-name `%Node` access. Hard-coded `../..` paths break on any reparent. (Godot docs — Scene organization)
Free tree-attached nodes with `queue_free()`, not `free()`. `queue_free` defers destruction to a safe point in the frame; `free()` mid-signal or mid-iteration corrupts the tree. (Godot docs — Nodes and scenes)
Each scene owns one responsibility. A scene that handles input, rendering, persistence, and networking at once should be split into composed sub-scenes. (Godot docs — Scene organization)

**Why:** Godot's strength is the scene tree — composition through instanced scenes is the engine-idiomatic substitute for inheritance and keeps units small and swappable. Path coupling and manual `get_node` polling are the two most common sources of fragile, reparent-hostile scene code. Source: Godot docs — Nodes and scenes, Scene organization.

## Signals

Emit a signal when something changes; do not poll for the change in `_process`. Per-frame polling burns CPU and couples the watcher to the watched node's internals. Signals invert the dependency. (Godot docs — Signals)
Declare intent with the `signal` keyword and typed parameters: `signal health_changed(amount: int)`. Named, typed signals document the event contract; generic catch-all signals do not. (Godot docs — Signals)
Never connect the same callable to the same signal twice — it fires twice. Guard with `is_connected()` before connecting in code paths that can run more than once. (Godot docs — Signals)
Disconnect when the connection outlives the emitter–receiver relationship (e.g. a receiver that persists while emitters churn). Connections to a freed node clean up automatically, but a live receiver holding stale connections leaks and double-fires. (Godot docs — Signals)

**Why:** Signals are Godot's first-class decoupling primitive — an emitter never needs to know who listens. Replacing `_process` polling with signals removes per-frame cost and a hard dependency; connect/disconnect discipline prevents the double-fire and stale-connection bugs that signals otherwise invite. Source: Godot docs — Signals.
