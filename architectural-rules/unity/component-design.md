---
name: Unity component-based design
description: Component-based only. No god MonoBehaviours. Single responsibility per component.
type: user
kind: architectural-rule
scope: [unity, components]
relevance: when-domain-unity
---

- <!-- id: unity-component-single-responsibility --> Component-based design only. Each MonoBehaviour owns one responsibility.
- <!-- id: no-god-components --> No god components orchestrating unrelated systems. Split by concern and compose at the GameObject level.
- <!-- id: unity-composition-over-inheritance --> Prefer composition of small components over inheritance trees of MonoBehaviours.

**Why:** Unity's GameObject/component composition model fights inheritance. Working with the grain keeps prefabs reusable and testable.
