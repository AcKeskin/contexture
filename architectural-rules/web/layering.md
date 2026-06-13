---
name: Web layering
description: Clear separation UI / State / Transport / Domain. No framework-specific logic in core domain.
type: user
kind: architectural-rule
scope: [web, layering, architecture]
relevance: when-language-web
---

- Four layers, strict dependencies inward:
  - **Domain** — pure business logic, framework-agnostic.
  - **State** — application state shape, reducers / stores.
  - **Transport** — HTTP, WebSocket, other I/O adapters.
  - **UI** — presentation, framework components.
- Domain must have no React / Vue / Angular / framework imports.
- UI talks to State; State talks to Transport; Transport talks to Domain types (not the other way).
- Avoid magic globals. No module-level mutable state.

**Why:** frameworks churn. Domain logic bound to framework primitives dies with the framework.
