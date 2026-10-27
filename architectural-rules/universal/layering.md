---
name: Layering (universal)
description: Clear separation Core / Platform / Integration / UI. Platform-specific code isolated. Dependencies point inward.
type: user
kind: architectural-rule
scope: [layering, architecture, universal]
relevance: always
---

- <!-- id: layers-architecture --> Layers: **Core** (domain logic, framework-free) → **Platform** (OS / engine specifics) → **Integration** (transport, persistence, external services) → **UI** (presentation).
- <!-- id: platform-code-isolated --> Platform-specific code lives only in the Platform layer. Core is platform-free.
- <!-- id: interfaces-at-boundaries --> Interfaces at layer boundaries. Inner layers define contracts; outer layers implement them.
- <!-- id: dependency-inward --> Dependency direction strictly inward. Outer depends on inner; never the reverse.

**Why:** layering keeps core logic portable and testable, and makes swapping a boundary cheap.
