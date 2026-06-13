---
name: Nodes and scenes
description: Compose scenes over inheritance; resolve node refs safely; own lifetime through the tree
type: user
kind: architectural-rule
scope: [godot, scene-tree]
relevance: when-engine-godot
origin: shipped
---

<!-- id: compose-over-inherit --> Build behaviour by composing scenes and child nodes, not by deepening a node-class inheritance chain. Reusable behaviour goes in its own scene instanced where needed. (Godot docs — Scene organization)
<!-- id: onready-node-refs --> Cache child-node references with `@onready var x := $Path` (or `%UniqueName`), not by calling `get_node` repeatedly each frame. @onready resolves once after the tree is ready. (Godot docs — Nodes and scenes)
<!-- id: no-deep-path-coupling --> Never reach across the tree with brittle relative paths like `get_node("../../Other")`. Expose an `@export var target: NodePath` and resolve it, or use scene-unique-name `%Node` access. Hard-coded `../..` paths break on any reparent. (Godot docs — Scene organization)
<!-- id: own-lifetime-via-tree --> Free tree-attached nodes with `queue_free()`, not `free()`. `queue_free` defers destruction to a safe point in the frame; `free()` mid-signal or mid-iteration corrupts the tree. (Godot docs — Nodes and scenes)
<!-- id: one-scene-one-responsibility --> Each scene owns one responsibility. A scene that handles input, rendering, persistence, and networking at once should be split into composed sub-scenes. (Godot docs — Scene organization)

**Why:** Godot's strength is the scene tree — composition through instanced scenes is the engine-idiomatic substitute for inheritance and keeps units small and swappable. Path coupling and manual `get_node` polling are the two most common sources of fragile, reparent-hostile scene code. Source: Godot docs — Nodes and scenes, Scene organization.
