---
name: C# disposal and lifetime
description: IDisposable/IAsyncDisposable for owned resources, using declarations, dispose only what you own, Dispose pattern for unsealed types.
type: user
kind: architectural-rule
scope: [csharp, disposal, lifetime]
relevance: when-language-csharp
origin: shipped
---

<!-- id: implement-idisposable --> Implement `IDisposable` when a type owns unmanaged resources or other disposables; `IAsyncDisposable` when cleanup is itself async (streams, channels, DB connections).
<!-- id: using-declarations --> Use `using` declarations (`using var x = ...;`) or statements for deterministic disposal. Do not rely on the finalizer / GC for resource release.
<!-- id: own-what-you-dispose --> The owner of a disposable disposes it. Do not dispose something passed in that you do not own (a borrowed stream, an injected dependency). Ownership of the lifetime is a design decision — make it explicit.
<!-- id: dispose-pattern --> Unsealed types holding unmanaged resources follow the full Dispose pattern (`protected virtual void Dispose(bool disposing)` + `GC.SuppressFinalize`). Sealed types with only managed disposables can implement the simple form.

**Why:** non-deterministic cleanup leaks handles, sockets, and locks under load; double-disposal of borrowed resources corrupts shared state. Source: Microsoft .NET IDisposable guidance.
