---
name: C# in Godot
description: Export/Signal attributes, marshalling-cost discipline, GodotObject lifetime vs C# GC, Callable connections
type: user
kind: architectural-rule
scope: [godot, csharp-binding]
relevance: when-engine-godot
origin: shipped
---

<!-- id: export-attribute --> Expose inspector-editable fields with `[Export]` on a C# property/field, the binding equivalent of GDScript's `@export`. Plain C# fields are invisible to the editor. (Godot docs — C# basics)
<!-- id: signal-delegate --> Declare signals as `[Signal] public delegate void NameEventHandler(...)`. The generated event is the typed, editor-visible signal; ad-hoc C# events are not Godot signals. (Godot docs — C# basics)
<!-- id: minimize-marshalling --> Every C#↔engine call crosses a marshalling boundary with real per-call cost. Do not make many small cross-language calls per frame — batch work and cache values on the C# side. (Godot docs — C# API differences)
<!-- id: godotobject-lifetime --> A `GodotObject` (Node, Resource) has engine-owned native lifetime that is independent of the C# GC. Free engine objects explicitly (`QueueFree`/`Free`); never assume the GC reclaims them, and never touch a C# wrapper after the native object is freed. (Godot docs — C# API differences)
<!-- id: callable-connections --> Connect signals in C# with a `Callable` (e.g. `Connect(SignalName.X, Callable.From(handler))`), not a raw string method name. Callable-based connection is type-checked and refactor-safe. (Godot docs — C# basics)

Cross-reference: the universal C# rules under `csharp/` still apply — these add only the Godot-binding specifics on top of them.

**Why:** The C# binding sits over a native engine: the marshalling boundary and the GodotObject/GC lifetime split are the two seams where idiomatic C# assumptions break. Treating engine objects as GC-managed, or chattering across the boundary each frame, produces both correctness bugs (use-after-free) and frame-time regressions. Source: Godot docs — C# basics / C# API differences.
