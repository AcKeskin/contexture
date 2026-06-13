---
name: TypeScript narrowing and exhaustiveness
description: Exhaustive switch with never default, user-defined type guards, typeof/instanceof/in for narrowing.
type: user
kind: architectural-rule
scope: [typescript, narrowing]
relevance: when-language-typescript
origin: shipped
---

<!-- id: exhaustive-never --> Force exhaustive handling of a union with a `never`-typed default branch (`const _x: never = value;`). Adding a new union member then fails to compile until it's handled — the compiler becomes the checklist.
<!-- id: type-guards --> Write user-defined type guards (`function isFish(x: Fish | Bird): x is Fish`) when narrowing isn't structural. The `x is T` predicate teaches the compiler what the runtime check proves.
<!-- id: narrowing-operators --> Use `typeof`, `instanceof`, and `in` to narrow within a block. Let control flow narrow the type instead of casting.
<!-- id: no-cast-narrowing --> Do not narrow by casting (`x as T`). A cast asserts; a guard proves. Casts are the place runtime/compile-time disagreement hides.

**Why:** the `never` exhaustiveness trick turns "someone added a case and forgot to handle it" from a production bug into a compile error — the single highest-leverage TS pattern for evolving unions. Source: TypeScript Handbook.
