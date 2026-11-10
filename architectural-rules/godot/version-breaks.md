---
name: Godot 4.4 to 4.7 breaking changes
description: Read the project's Godot version first; the model's training thins out after 4.3. GDScript-visible renames, removals and behavior changes from the official 4.4 to 4.7 migration guides.
type: user
kind: architectural-rule
scope: [godot, gdscript]
relevance: when-engine-godot
origin: shipped
---

<!-- id: check-version-first --> **Check the version before writing engine API.** `config/features` in `project.godot` (e.g. `PackedStringArray("4.6", ...)`) names it. Write for that version; when it is 4.4 or later and an API below is involved, use the new form. Not sure an API exists in that version: say so, don't guess. A version newer than this list: read that version's migration guide.

<!-- id: breaks-4-7 --> **4.7** (from 4.6). Override of a method with a typed return inherits the type: add an explicit `return` (`return null` fixes the error). Setting one element of a packed array no longer calls the whole property's setter. Mouse and keyboard events no longer use device `0`: test the event type, or compare `event.device` to `InputEvent.DEVICE_ID_MOUSE` / `DEVICE_ID_KEYBOARD`. `RichTextLabel.ImageUpdateMask.UPDATE_WIDTH_IN_PERCENT` is now `UPDATE_WIDTH_UNIT`. `AudioEffectSpectrumAnalyzer.tap_back_pos` removed. `AudioStreamPlayer` `area_mask` default is `0`: an `Area` `audio_bus_override` that relied on layer 1 needs the mask set back. Jolt: `WorldBoundaryShape3D.plane.d` sign flipped vs 4.6; `SoftBody3D` mass is 1 kg for the whole body and stiffness changed (re-tune); `Area3D` now reports `SoftBody3D` overlaps. Blend spaces: `sync` bool replaced by `sync_mode`. `CanvasItem` lines lost the antialiasing feather (look thinner). New projects default to stretch `canvas_items` + `expand`. Editor plugins: `EditorVCSInterface._commit` gains `amend`.

<!-- id: breaks-4-6 --> **4.6** (from 4.5). New projects default to Jolt 3D physics and, on Windows, D3D12. `MeshInstance3D.skeleton` default is `NodePath("")` (was `".."`). Glow default blend is Screen (brighter); volumetric fog brighter; re-tune Environment. `AStar*.get_point_path` / `get_id_path` return empty when `from_id` is disabled or solid. `.tscn` drops `load_steps` and saves unique node IDs: expect large diffs on first save (Project > Tools > Upgrade Project Files). Editor plugins: `EditorFileDialog.add_side_menu` removed.

<!-- id: breaks-4-5 --> **4.5** (from 4.4). `Node.get_rpc_config` renamed `get_node_rpc_config`. `JSONRPC.set_scope` replaced by `set_method`. `Resource.duplicate(true)` no longer copies external sub-resources: use `duplicate_deep(Resource.DEEP_DUPLICATE_ALL)` for the old result. `TileMapLayer` physics chunking is on: `get_coords_for_body_rid()` is less precise unless `physics_quadrant_size = 1`. Jolt: `Area3D` always reports static-body overlaps (the setting is gone; use layers). Navigation regions update asynchronously by default.

<!-- id: breaks-4-4 --> **4.4** (from 4.3). `FileAccess.store_*` return `bool` (was `void`). `GraphEdit.frame_rect_changed` passes a `Rect2`. `OS.read_string_from_stdin` takes `buffer_size`. `Curve` enforces `min_value`/`max_value`. CSG uses Manifold: non-manifold meshes no longer work. Android sensor events are off by default. Editor plugins: `EditorSceneFormatImporter._get_import_flags` removed; `EditorTranslationParserPlugin._parse_file` returns an `Array`.

**Why:** models know Godot up to about 4.3 and write the old names with full confidence; the error shows only when the editor loads the script. Source: godot-docs `tutorials/migrating/upgrading_to_godot_4.{4,5,6,7}.rst` at 0709b93 (2026-11-07), GDScript-visible rows and behavior changes only; C#-binary and GDExtension-only rows left out. Idea from caiizilaz/godot-agent-harness.
