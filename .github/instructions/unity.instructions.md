---
applyTo: "**/*.cs"
---

# unity rules

> Auto-loaded by Copilot when editing files matching `**/*.cs`. Generated from `architectural-rules/unity/` — do not hand-edit.

## Unity component-based design

- Component-based design only. Each MonoBehaviour owns one responsibility.
- No god components orchestrating unrelated systems. Split by concern and compose at the GameObject level.
- Prefer composition of small components over inheritance trees of MonoBehaviours.

**Why:** Unity's ECS-adjacent composition model fights inheritance. Working with the grain keeps prefabs reusable and testable.

## Unity input via Input Actions on <Pointer>, not EnhancedTouch polling

For pointer/touch input in Unity (Input System 1.x+), the default approach is `InputActionAsset` with bindings on the abstract `<Pointer>` device:

- `Press` — Button action bound to `<Pointer>/press`
- `Position` — Value/Vector2 action bound to `<Pointer>/position`

`<Pointer>` is the abstract base class for `Mouse`, `Pen`, and `Touchscreen`. One binding handles desktop editor (mouse), tablet (pen), and device (touch) without `TouchSimulation`.

**Why:**

1. **Unified surface.** One binding covers mouse, pen, and touch. No editor-vs-device branches in input code.
2. **Survives synthetic-event testing.** Input Actions consume Unity's input event stream, so `InputSystem.QueueStateEvent` works in play-mode tests. `EnhancedTouch.Touch.activeTouches` polling does not respond to queued state events.
3. **Avoids the TouchSimulation gotcha.** `TouchSimulation.Enable()` creates the singleton but leaves its MonoBehaviour disabled in Input System 1.19 — no Touchscreen device registers, polling reads empty. Input Actions sidestep this entirely.
4. **Documented modern path.** Rebinding, control schemes, the PlayerInput component, and multi-device flows all build on Input Actions. EnhancedTouch polling is a dead end for any of those.

**How to apply:**

- Create an `InputActionAsset` (`*.inputactions`) with at least a Gameplay map containing `Press` (Button → `<Pointer>/press`) and `Position` (Value/Vector2 → `<Pointer>/position`).
- Components that need input take `[SerializeField] InputActionAsset _actions` and look up the map + actions in `Awake`.
- Subscribe in `OnEnable` (`action.performed += handler`), unsubscribe in `OnDisable`. Call `map.Enable()` / `map.Disable()` to gate.
- Read companion values inside the callback via `otherAction.ReadValue<T>()` rather than caching them in `Update`.

**When to deviate:**

- True multi-touch with simultaneous gesture tracking (pinch-zoom + two-finger pan etc.) — EnhancedTouch's `activeTouches` is the right primitive there. Even then, register the EnhancedTouch path *alongside* Input Actions for the press/position basics, not instead of.
- Editor-only debug tools that need direct device access. Input Actions are still preferred but the cost/benefit can flip.

**Counter-cases recorded:** none yet for typical games. Revisit when a touch-gesture-heavy project surfaces real friction.

## Unity .meta files

- **Never edit, rename, or delete `.meta` files directly.**
- Move / rename assets through the Unity editor or Unity-aware tooling — the editor updates `.meta` references atomically.
- If a `.meta` file is missing or orphaned, let Unity regenerate it on next import rather than hand-editing.

**Why:** `.meta` files carry the GUIDs that every reference in the project depends on. Hand-editing silently corrupts prefabs, scenes, and asset references.

## Unity namespaces and using directives

- Namespace convention: `Project.Feature.Subfeature`.
- Import only required namespaces. No wildcard-style catch-all using directives.
- Always include `using UnityEngine;` when logging.
- Use `UnityEngine.Debug` fully-qualified when it conflicts with `System.Diagnostics.Debug` in the same file.
- Editor scripts: `using UnityEngine;` + `using UnityEditor;`. Keep editor-only code under an `Editor/` folder so it strips from player builds.

**Why:** namespace discipline prevents collisions (particularly around Debug) and keeps player builds free of editor-only dependencies.

## Unity serialization and inspector clarity

- Use `[SerializeField] private` for serialized fields. Do not expose fields as `public` for the inspector.
- `[Header("...")]` to group related fields.
- `[Tooltip("...")]` to document non-obvious fields.
- Do not serialize derived / computed state — recompute on demand or in `OnValidate`.

**Why:** `public` fields leak into the API surface and can be mutated by any script. `SerializeField` gives inspector access without public exposure.

## UGUI creation discipline

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

## Unity UI architecture rules

- UI never owns or directly mutates game state. Display state, emit events / commands for changes.
- All player-facing strings go through the localization system. No hardcoded strings in UXML, prefabs, or code.
- Every interactive element must be reachable by both pointer (mouse/touch) and gamepad. Mouse-only navigation is a bug.
- Animations must be skippable. Respect reduced-motion preferences when the platform exposes them.
- UI must never block the main thread. Long work goes off-thread or into coroutines/Awaitable.
- Pick UI Toolkit for new screen-space UI on Unity 2022.3+. Drop to UGUI only when UI Toolkit can't deliver — world-space UI, complex tween chains driven by DOTween, or features UITK still lacks at the project's editor target.
- Do not mix UI Toolkit and UGUI inside the same screen. Pick one per screen.

**Why:** UI that owns state desyncs from the simulation the moment another system touches the same value. Localization-after-the-fact requires retrofitting every label site. Gamepad parity is non-negotiable for console / Steam Deck targets and trivial to add up front. UI Toolkit is the strategic engine path — UGUI is in maintenance — but UGUI still wins for world-space and tween-heavy work, so don't pretend it's deprecated.

## USS is not full CSS

USS looks like CSS but the supported subset is small. Generating "valid CSS" without checking USS support produces files that parse silently and render wrong.

## Supported

- Flex layout: `flex-direction`, `flex-wrap`, `align-items`, `justify-content`, `flex-grow/shrink/basis`.
- `border-radius`, `opacity`, `overflow: hidden`, `padding`, `margin`.
- Transforms: `translate`, `scale`, `rotate`. Transitions on most properties.
- CSS variables (`--token: value;` + `var(--token)`). Use `:root {}` for design tokens.

## Not supported — workarounds

| CSS pattern | USS status | Workaround |
|---|---|---|
| `display: grid` | Unsupported | Flex with `flex-direction: row` + `flex-wrap: wrap` and explicit child widths. |
| `box-shadow` | Unsupported | Add a child `VisualElement` behind the content with offset + alpha background. |
| `linear-gradient()` / `radial-gradient()` | Unsupported | Use a sliced background image texture. |
| `calc()` | Unsupported | Compute the value in C# and set the inline style, or use explicit values. |
| `@media` queries | Unsupported | `PanelSettings.scaleMode = ScaleWithScreenSize` + reference resolution. Branch in C# if you need device-class behavior. |
| `::before` / `::after` | Unsupported | Add a real child `VisualElement` with absolute positioning. |
| `z-index` | Unsupported | Render order is sibling order. Move the element later in the parent's children, or `BringToFront()` in C#. |
| `display: block` / `inline` | Unsupported | Everything is flex. Use `display: flex` (default) or `display: none`. |

## Other constraints

- USS class names and CSS variable names stay English. Localize visible *text*, not selectors.
- Prefer one root UXML per screen with `<Style src="..."/>` for shared stylesheets. Inline `style=""` on UXML elements is allowed but defeats theming — use classes.
- Read [Unity-Skills' USS_REFERENCE.md](https://github.com/Besty0728/Unity-Skills/blob/main/SkillsForUnity/unity-skills~/skills/uitoolkit/USS_REFERENCE.md) before generating non-trivial USS systems — it has worked patterns for cards, modals, scrollers.

**Why:** USS uses the Yoga flex engine, not a CSS engine. Anything outside flex + transforms either silently no-ops or produces a layout that looks right in the snapshot and breaks at a different resolution. The unsupported list is stable across Unity 2022.3 → Unity 6.
