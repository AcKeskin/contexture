---
name: GDScript style
description: Static typing hints, canonical naming, one unique class_name per file, explicit over dynamic
type: user
kind: architectural-rule
scope: [godot, gdscript]
relevance: when-engine-godot
origin: shipped
---

<!-- id: static-typing-hints --> Annotate types: `var speed: int = 10`, `func move(dir: Vector2) -> void:`. Static hints give editor errors, autocompletion, and a small runtime speedup over untyped dynamic code. (Godot GDScript style guide)
<!-- id: naming-conventions --> snake_case for functions and variables, PascalCase for classes and node names, CONSTANT_CASE for constants and enum members. Follow the style guide's casing exactly — mixed casing breaks reader expectations. (Godot GDScript style guide)
<!-- id: one-classname-per-file --> At most one `class_name` per script, and it must be globally unique. A duplicate `class_name` triggers "Class X hides a global script class" and breaks load. (Godot GDScript style guide)
<!-- id: explicit-over-dynamic --> Prefer explicit typed access over dynamic patterns. Avoid `get()/set()`-by-string and `call()`-by-string when a direct typed call exists; reserve dynamic dispatch for cases that genuinely need it. (Godot GDScript style guide)

**Why:** GDScript is dynamically typed by default, so discipline is opt-in. Type hints, canonical naming, and unique `class_name`s are what make a GDScript codebase navigable, autocompletable, and free of the global-class-collision failures that silently break plugin and project loads. Source: Godot GDScript style guide.
