---
applyTo: "**/*.{html,css,jsx,tsx}"
---

# web rules

> Auto-loaded by Copilot when editing files matching `**/*.{html,css,jsx,tsx}`. Generated from `architectural-rules/web/` — do not hand-edit.

## Web async discipline

- All async work is explicit. `async/await` at call sites, not fire-and-forget.
- No implicit side effects in render / effect hooks beyond what the contract allows (e.g. React `useEffect` cleanup).
- Cancelation is part of the design — every long-running async operation has a cancel path (AbortController, effect cleanup, subscription disposal).
- Errors in async work are handled explicitly. Unhandled promise rejections are bugs, not warnings to ignore.

**Why:** async bugs dominate production incidents in web apps. Explicit patterns catch them at review time.

## Web layering

- Four layers, strict dependencies inward:
  - **Domain** — pure business logic, framework-agnostic.
  - **State** — application state shape, reducers / stores.
  - **Transport** — HTTP, WebSocket, other I/O adapters.
  - **UI** — presentation, framework components.
- Domain must have no React / Vue / Angular / framework imports.
- UI talks to State; State talks to Transport; Transport talks to Domain types (not the other way).
- Avoid magic globals. No module-level mutable state.

**Why:** frameworks churn. Domain logic bound to framework primitives dies with the framework.

## Web state flow

- State flow is predictable: state in → render out → action → state in. Unidirectional.
- No magic globals. No `window.*` mutation for app state.
- State changes are explicit and traceable — every change has an identifiable source (action, event handler, effect).
- Prefer derived state over duplicated state. If two pieces of state can disagree, one is wrong.

**Why:** state bugs are the hardest to reproduce. Predictable flow is the minimum insurance.
