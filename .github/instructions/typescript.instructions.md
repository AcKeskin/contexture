---
applyTo: "**/*.{ts,tsx}"
---

# typescript rules

> Auto-loaded by Copilot when editing files matching `**/*.{ts,tsx}`. Generated from `architectural-rules/typescript/` — do not hand-edit.

## TypeScript async

Never leave a promise floating — `await` it, `return` it, or explicitly `void` it. An unawaited promise drops its rejection on the floor (unhandled rejection) and breaks ordering assumptions.
Prefer `async`/`await` over `.then()` chains for sequential work — flatter, debuggable, and error handling is one `try/catch` instead of scattered `.catch()`.
Type async returns as `Promise<T>` explicitly on public APIs. Let the caller see the contract without inferring it.
Do not pass an `async` callback where a synchronous one is expected (`Array.forEach`, most event handlers) — the returned promise is ignored and errors vanish. Use `for...of` with `await`, or `Promise.all(map(...))`.

**Why:** floating promises and async-callback-in-forEach are the two patterns that silently swallow async errors in TS — they look correct and fail invisibly. Source: TypeScript Handbook, typescript-eslint rules.

## TypeScript modules

Prefer named exports over default exports. Named exports are refactor-safe (rename propagates), discoverable by autocomplete, and avoid the "default-export sprawl" where every file's main thing is anonymously `default`.
Use configured path aliases (`@/domain/...`) instead of deep relative chains (`../../../..`). Relative-depth churn on every move is friction the bundler can erase.
No circular module dependencies. They cause undefined-at-import-time bugs that depend on evaluation order. Break the cycle by extracting the shared piece.
Use `import type { X }` for type-only imports — it is erased at compile time and prevents accidental runtime coupling / side-effect imports.

**Why:** default exports defeat rename-refactoring and circular deps produce order-dependent `undefined` that reproduces only sometimes — both are structural, not stylistic. Source: TypeScript Handbook, Google TypeScript Style Guide.

## TypeScript narrowing and exhaustiveness

Force exhaustive handling of a union with a `never`-typed default branch (`const _x: never = value;`). Adding a new union member then fails to compile until it's handled — the compiler becomes the checklist.
Write user-defined type guards (`function isFish(x: Fish | Bird): x is Fish`) when narrowing isn't structural. The `x is T` predicate teaches the compiler what the runtime check proves.
Use `typeof`, `instanceof`, and `in` to narrow within a block. Let control flow narrow the type instead of casting.
Do not narrow by casting (`x as T`). A cast asserts; a guard proves. Casts are the place runtime/compile-time disagreement hides.

**Why:** the `never` exhaustiveness trick turns "someone added a case and forgot to handle it" from a production bug into a compile error — the single highest-leverage TS pattern for evolving unions. Source: TypeScript Handbook.

## TypeScript type system

Prefer `unknown` over `any` for values of uncertain type. `unknown` forces you to narrow before use; `any` disables checking and silently spreads. Reserve `any` for genuine escape hatches, commented.
Model variant data as a discriminated union — a shared literal `kind` field across members. Narrowing on the discriminant gives the compiler exhaustiveness and per-variant typing.
Use `readonly` properties and `ReadonlyArray<T>` / `readonly T[]` to express immutability and prevent accidental mutation. Use `as const` for literal values that should be deeply readonly.
Do not use the non-null assertion `!` as a habit — it overrides the compiler's null analysis. Narrow with a guard or restructure so the value is provably present.

**Why:** `any` and habitual `!` are the two ways a TS codebase quietly becomes untyped — each one disables exactly the checks that justify using TypeScript at all. Source: TypeScript Handbook.
