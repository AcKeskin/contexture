---
name: Unity component-based design
description: Component-based only. No god MonoBehaviours. Single responsibility per component.
type: user
kind: architectural-rule
scope: [unity, components]
relevance: when-domain-unity
---

- Component-based design only. Each MonoBehaviour owns one responsibility.
- No god components orchestrating unrelated systems. Split by concern and compose at the GameObject level.
- Prefer composition of small components over inheritance trees of MonoBehaviours.

**Why:** Unity's ECS-adjacent composition model fights inheritance. Working with the grain keeps prefabs reusable and testable.
