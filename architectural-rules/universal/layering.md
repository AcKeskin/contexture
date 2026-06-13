---
name: Layering (universal)
description: Clear separation Core / Platform / Integration / UI. Platform-specific code isolated. Dependencies point inward.
type: user
kind: architectural-rule
scope: [layering, architecture, universal]
relevance: always
---

- Layers: **Core** (domain logic, framework-free) → **Platform** (OS / engine specifics) → **Integration** (transport, persistence, external services) → **UI** (presentation).
- Platform-specific code lives only in the Platform layer. Core is platform-free.
- Interfaces at layer boundaries. Inner layers define contracts; outer layers implement them.
- Dependency direction strictly inward. Outer depends on inner; never the reverse.

**Why:** layering is what keeps core logic portable and testable. Inversion of control at the boundary is what makes swap-out cheap later.
