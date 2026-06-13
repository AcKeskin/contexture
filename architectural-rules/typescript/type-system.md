---
name: TypeScript type system
description: unknown over any, discriminated unions for variants, readonly for intent, as const for literals, no habitual non-null !.
type: user
kind: architectural-rule
scope: [typescript, type-system]
relevance: when-language-typescript
origin: shipped
---

<!-- id: unknown-over-any --> Prefer `unknown` over `any` for values of uncertain type. `unknown` forces you to narrow before use; `any` disables checking and silently spreads. Reserve `any` for genuine escape hatches, commented.
<!-- id: discriminated-unions --> Model variant data as a discriminated union — a shared literal `kind` field across members. Narrowing on the discriminant gives the compiler exhaustiveness and per-variant typing.
<!-- id: readonly --> Use `readonly` properties and `ReadonlyArray<T>` / `readonly T[]` to express immutability and prevent accidental mutation. Use `as const` for literal values that should be deeply readonly.
<!-- id: no-non-null --> Do not use the non-null assertion `!` as a habit — it overrides the compiler's null analysis. Narrow with a guard or restructure so the value is provably present.

**Why:** `any` and habitual `!` are the two ways a TS codebase quietly becomes untyped — each one disables exactly the checks that justify using TypeScript at all. Source: TypeScript Handbook.
