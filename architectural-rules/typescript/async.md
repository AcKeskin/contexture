---
name: TypeScript async
description: No floating promises, await over .then chains, Promise<T> typed returns, handle rejection, no async in array callbacks expecting sync.
type: user
kind: architectural-rule
scope: [typescript, async]
relevance: when-language-typescript
origin: shipped
---

<!-- id: no-floating-promises --> Never leave a promise floating — `await` it, `return` it, or explicitly `void` it. An unawaited promise drops its rejection on the floor (unhandled rejection) and breaks ordering assumptions.
<!-- id: await-over-then --> Prefer `async`/`await` over `.then()` chains for sequential work — flatter, debuggable, and error handling is one `try/catch` instead of scattered `.catch()`.
<!-- id: typed-promise --> Type async returns as `Promise<T>` explicitly on public APIs. Let the caller see the contract without inferring it.
<!-- id: no-async-in-sync-callback --> Do not pass an `async` callback where a synchronous one is expected (`Array.forEach`, most event handlers) — the returned promise is ignored and errors vanish. Use `for...of` with `await`, or `Promise.all(map(...))`.

**Why:** floating promises and async-callback-in-forEach are the two patterns that silently swallow async errors in TS — they look correct and fail invisibly. Source: TypeScript Handbook, typescript-eslint rules.
