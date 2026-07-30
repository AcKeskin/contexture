---
name: SOLID and responsibilities
description: SOLID, single-responsibility, composition over inheritance — apply to every class and function, every language
type: user
kind: architectural-rule
scope: [solid, responsibilities, universal]
relevance: always
---

- <!-- id: one-responsibility --> One responsibility per class / function. Split as soon as a second concern creeps in.
- <!-- id: composition-over-inheritance --> Composition over inheritance. Inheritance only when the "is-a" is durable and substitutable; otherwise compose.
- <!-- id: explicit-ownership --> Explicit ownership, lifetimes, responsibilities. If "who owns this" is unclear, the design is wrong.

**Why:** the cost of these rules is paid once at design time; the cost of ignoring them compounds forever.
