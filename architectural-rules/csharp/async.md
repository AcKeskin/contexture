---
name: C# async
description: Task-returning, Async suffix, ConfigureAwait(false) in libraries, no async void except handlers, never block on async.
type: user
kind: architectural-rule
scope: [csharp, async]
relevance: when-language-csharp
origin: shipped
---

<!-- id: task-returning --> Async methods return `Task` / `Task<T>` (or `ValueTask<T>` for hot paths). Never `async void` except event handlers — an exception in `async void` cannot be caught and tears down the process.
<!-- id: async-suffix --> Name async methods with the `Async` suffix (`LoadAsync`). The suffix is the contract that the method is awaitable.
<!-- id: configureawait --> Library code calls `ConfigureAwait(false)` on awaits — it does not capture the caller's synchronization context, which prevents deadlocks in callers that block. Application/UI code that needs the context omits it.
<!-- id: no-sync-over-async --> Never block on async with `.Result` / `.Wait()` / `GetAwaiter().GetResult()`. Sync-over-async deadlocks on a captured context. Await all the way up, or make the entry point async.
<!-- id: cancellation --> Long-running async work takes a `CancellationToken` and honours it. Cancellation is part of the contract, not an afterthought.

**Why:** async bugs in C# are silent until production — a swallowed `async void` exception or a sync-over-async deadlock looks fine in tests and hangs under load. Source: Microsoft .NET async guidance.
