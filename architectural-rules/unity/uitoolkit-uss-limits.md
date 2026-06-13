---
name: USS is not full CSS
description: USS supports flex, transforms, transitions, variables. No grid, no box-shadow, no z-index, no calc, no @media, no pseudo-elements, no gradients.
type: user
kind: architectural-rule
scope: [unity, ui, uitoolkit]
relevance: when-domain-unity
---

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
