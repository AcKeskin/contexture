---
name: Unity input via Input Actions on <Pointer>, not EnhancedTouch polling
description: Bind InputActions to `<Pointer>/press` and `<Pointer>/position`. Avoid EnhancedTouch.activeTouches — couples to TouchSimulation, brittle in editor.
type: user
kind: architectural-rule
scope: [unity, input-system]
relevance: when-domain-unity, when-language-csharp
---

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
