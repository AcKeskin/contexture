---
name: TypeScript modules
description: Named exports over default, path aliases over deep relatives, no circular deps, import type for type-only imports.
type: user
kind: architectural-rule
scope: [typescript, modules, imports]
relevance: when-language-typescript
origin: shipped
---

<!-- id: named-exports --> Prefer named exports over default exports. Named exports are refactor-safe (rename propagates), discoverable by autocomplete, and avoid the "default-export sprawl" where every file's main thing is anonymously `default`.
<!-- id: path-aliases --> Use configured path aliases (`@/domain/...`) instead of deep relative chains (`../../../..`). Relative-depth churn on every move is friction the bundler can erase.
<!-- id: no-circular --> No circular module dependencies. They cause undefined-at-import-time bugs that depend on evaluation order. Break the cycle by extracting the shared piece.
<!-- id: import-type --> Use `import type { X }` for type-only imports — it is erased at compile time and prevents accidental runtime coupling / side-effect imports.

**Why:** default exports defeat rename-refactoring and circular deps produce order-dependent `undefined` that reproduces only sometimes — both are structural, not stylistic. Source: TypeScript Handbook, Google TypeScript Style Guide.
