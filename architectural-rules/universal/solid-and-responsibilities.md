---
name: SOLID and responsibilities
description: SOLID, single-responsibility, composition over inheritance — apply to every class and function, every language
type: user
kind: architectural-rule
scope: [solid, responsibilities, universal]
relevance: always
---

- One responsibility per class / function. Split as soon as a second concern creeps in.
- Composition over inheritance. Inheritance only when the "is-a" is durable and substitutable; otherwise compose.
- Explicit ownership, lifetimes, responsibilities. If "who owns this" is unclear, the design is wrong.
- Clear layering. Dependencies point inward (domain ← services ← transport / UI). Never the reverse.

**Why:** the cost of these rules is paid once at design time; the cost of ignoring them compounds forever.
