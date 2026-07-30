---
name: Web layering
description: Clear separation UI / State / Transport / Domain. No framework-specific logic in core domain.
type: user
kind: architectural-rule
scope: [web, layering, architecture]
relevance: when-language-web
---

- <!-- id: web-four-layers --> Four layers, strict dependencies inward:
  - **Domain** — pure business logic, framework-agnostic.
  - **State** — application state shape, reducers / stores.
  - **Transport** — HTTP, WebSocket, other I/O adapters.
  - **UI** — presentation, framework components.
- <!-- id: web-domain-framework-isolated --> Domain must have no React / Vue / Angular / framework imports.
- <!-- id: web-dependencies-inward --> UI talks to State; State talks to Transport; Transport talks to Domain types (not the other way).
- <!-- id: web-no-module-globals --> Avoid magic globals. No module-level mutable state.
- <!-- id: web-vocab-map --> This vocabulary refines universal/layering for web apps: Domain = Core, Transport = Integration, UI = UI; State is web's extra layer between UI and Transport (Platform rarely appears). Universal/layering owns the base vocabulary.

**Why:** frameworks churn. Domain logic bound to framework primitives dies with the framework. Source: ports-and-adapters / clean-architecture layering.
