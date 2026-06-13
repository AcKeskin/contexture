---
name: UGUI creation discipline
description: Create-then-position pattern. Batch creates of 2+ elements. Anchor presets before manual rect math. TMP auto-detection.
type: user
kind: architectural-rule
scope: [unity, ui, ugui]
relevance: when-domain-unity
---

Discipline for creating UGUI hierarchies — applies whether the work is hand-written or driven through a tool like [Unity-Skills](https://github.com/Besty0728/Unity-Skills) or [Unity-MCP](https://github.com/IvanMurzak/Unity-MCP).

## Create-then-position

UGUI element creation does not take `x/y` coordinates. Place in three passes, in this order:

1. **Anchor preset** — `MiddleCenter` for modals, `TopLeft`/`TopRight` for HUD corners, `StretchAll` for full-screen backgrounds.
2. **Layout group** — `VerticalLayoutGroup` / `HorizontalLayoutGroup` / `GridLayoutGroup` on the parent before hand-positioning every child.
3. **Rect tweaks** — adjust `width`, `height`, `anchoredPosition` only after anchor + layout are correct.

Skipping straight to manual `RectTransform.anchoredPosition` math is the #1 cause of UI that drifts at different resolutions.

## Batching

When creating 2+ children of the same parent (menu buttons, HUD widgets, list rows), build them in one batch instead of one-by-one. Tools like Unity-Skills expose `ui_create_batch` for this; in code, build the prefab + use `Instantiate` in a loop with the parent set, then run a single layout pass.

## Hierarchy

- One Canvas per logical UI layer (HUD, Menus, Popups, WorldSpace).
- Set `Canvas.sortingOrder` explicitly. Don't rely on hierarchy order for cross-Canvas stacking.
- Static UI (background frames, labels) goes on a separate Canvas from dynamic UI (health bars, timers). One changing element dirties its entire Canvas for rebuild.
- Disable `Raycast Target` on non-interactive `Image` / `Text` elements. Default-on raycasts are a measurable hot-path cost on mobile.

## Text

- Text creation should auto-detect TextMeshPro and prefer `TextMeshProUGUI` over legacy `Text`. Legacy `Text` only as a fallback when TMP is not in the project.
- Don't mix TMP and legacy Text in the same screen unless there's a reason — they have different metrics, line-height, and atlas paths.

## Anti-hallucinations (when driving Unity-Skills)

If using [Besty0728/Unity-Skills](https://github.com/Besty0728/Unity-Skills), the following commonly-guessed names **do not exist**:

- `ui_add_canvas` → use `ui_create_canvas`.
- `ui_create_label` → use `ui_create_text`.
- `ui_create_checkbox` → use `ui_create_toggle`.
- `ui_set_color` → use `component_set_property` on `Image`/`Text`.
- `uitoolkit_create_button`, `uitoolkit_create_label` → UI Toolkit uses `uitk_add_element` with `elementType` for everything.
- `uitoolkit_create_canvas` → UI Toolkit has no Canvas; use `uitk_create_document` (UIDocument).
- `ui_create_batch.items` is a JSON-stringified array, not a raw array, in the current REST layer.

When in doubt, query the live tool list (`/skills/schema` for Unity-Skills, MCP `tools/list` for Unity-MCP) instead of guessing names.

**Why:** UGUI's create skills are intentionally position-agnostic so anchors and layouts stay authoritative. Hand-positioning bypasses both, producing UIs that work at one resolution and break at every other one. The hallucinated tool names are real failure modes from Anthropic-style models — having them written down up front is cheaper than a round-trip 404.
