---
applyTo: "**/*.cs"
---

# csharp rules

> Auto-loaded by Copilot when editing files matching `**/*.cs`. Generated from `architectural-rules/csharp/` — do not hand-edit.

## C# async

Async methods return `Task` / `Task<T>` (or `ValueTask<T>` for hot paths). Never `async void` except event handlers — an exception in `async void` cannot be caught and tears down the process.
Name async methods with the `Async` suffix (`LoadAsync`). The suffix is the contract that the method is awaitable.
Library code calls `ConfigureAwait(false)` on awaits — it does not capture the caller's synchronization context, which prevents deadlocks in callers that block. Application/UI code that needs the context omits it.
Never block on async with `.Result` / `.Wait()` / `GetAwaiter().GetResult()`. Sync-over-async deadlocks on a captured context. Await all the way up, or make the entry point async.
Long-running async work takes a `CancellationToken` and honours it. Cancellation is part of the contract, not an afterthought.

**Why:** async bugs in C# are silent until production — a swallowed `async void` exception or a sync-over-async deadlock looks fine in tests and hangs under load. Source: Microsoft .NET async guidance.

## C# collections and LINQ

LINQ queries use deferred execution — they do not run until enumerated. The query captures variables by reference; the result reflects state at enumeration time, not definition time.
Materialize with `ToList()` / `ToArray()` once when you need to iterate multiple times or capture a snapshot. Enumerating a query twice re-runs it.
Beware multiple enumeration of an `IEnumerable`, especially over DB/IO sources — each pass re-queries. Accept `IReadOnlyList<T>` / `IReadOnlyCollection<T>` in signatures when callers will enumerate more than once.
Prefer LINQ over hand-rolled loops where it reads clearer (filter/project/aggregate). Drop back to a loop when the operation is imperative, has side effects, or the LINQ becomes harder to read than the loop.

**Why:** deferred execution and silent re-enumeration are the two LINQ footguns that turn a clean query into an N+1 or a stale snapshot. Source: Microsoft .NET LINQ guidance.

## C# disposal and lifetime

Implement `IDisposable` when a type owns unmanaged resources or other disposables; `IAsyncDisposable` when cleanup is itself async (streams, channels, DB connections).
Use `using` declarations (`using var x = ...;`) or statements for deterministic disposal. Do not rely on the finalizer / GC for resource release.
The owner of a disposable disposes it. Do not dispose something passed in that you do not own (a borrowed stream, an injected dependency). Ownership of the lifetime is a design decision — make it explicit.
Unsealed types holding unmanaged resources follow the full Dispose pattern (`protected virtual void Dispose(bool disposing)` + `GC.SuppressFinalize`). Sealed types with only managed disposables can implement the simple form.

**Why:** non-deterministic cleanup leaks handles, sockets, and locks under load; double-disposal of borrowed resources corrupts shared state. Source: Microsoft .NET IDisposable guidance.

## C# events and delegate discipline

Every `+=` subscription has a corresponding `-=` unsubscription at the end of the subscriber's lifetime. Forgetting to unsubscribe keeps the subscriber alive for as long as the publisher lives (the publisher holds a delegate that closes over `this`), producing a memory leak and stale callbacks. The pattern: subscribe in `OnEnable` / constructor, unsubscribe in `OnDisable` / `Dispose`. A symmetrical unsubscribe-all before re-subscribing on re-initialization prevents double-subscription.
Do not capture `this` (or any large object graph) in a lambda that is stored in a long-lived event. Capturing `this` in a lambda that is assigned to a static event or a publisher that outlives the subscriber causes a leak identical to a missing `-=`. Use a named method (`HandleX`) and subscribe with `-= HandleX`; lambdas cannot be unsubscribed by value. Subscribing with a lambda is acceptable only when the publisher is destroyed together with the subscriber (e.g. a UI field on the same GameObject); a static-event subscriber with a lambda is the dangerous pattern.
Declare events with the `event` keyword, not as public `Action` / `Func` fields. A public delegate field lets any caller overwrite all subscribers with `=` instead of adding with `+=`, silently discarding prior subscriptions. `event` enforces += / -= at the call site. A public delegate field (e.g. `public Action CloseKeyboard;`) instead of an event is the anti-pattern — any caller can zero it with `=`.
Prefer `event Action<T>` for domain events carrying a single payload (game events, state changes). Use `event EventHandler<TEventArgs>` only when interoperability with .NET framework patterns is required (e.g. WinForms, WPF, or library APIs that expect sender). In Unity game code, `Action<T>` is idiomatic — it avoids the boilerplate `EventArgs` wrapper and the unused `sender` parameter.
Raise events with the null-conditional operator: `MyEvent?.Invoke(arg)`. This is thread-safe for the read (avoids a race between the null-check and the invocation on a captured copy) and eliminates the null-guard boilerplate. Do not use `if (MyEvent != null) MyEvent(arg)` — the two-step form has a TOCTOU race on multi-threaded publishers.
Do not capture loop-variable closures or create new delegate instances inside `Update`, `FixedUpdate`, or physics callbacks — each closure allocation puts pressure on the GC. Cache delegate instances as fields if they must be passed to APIs that accept `Action` per frame (e.g. `Invoke`, `StartCoroutine` workarounds). Prefer direct method calls over delegate indirection in hot paths.
When a component's event subscription depends on another component being initialized first, use `[DefaultExecutionOrder]` to enforce ordering or subscribe in `Start` (which runs after all `Awake`). Do not rely on Unity's indeterminate script execution order for event wiring. Assigning distinct `[DefaultExecutionOrder]` values establishes a clear initialization cascade.

**Why:** Missed unsubscriptions are the single most common long-lived memory leak in Unity C# — a subscriber object that should be dead keeps receiving callbacks, mutates stale state, and prevents GC collection of the entire object graph reachable from it. The `event` keyword and named-method unsubscription are the two structural guards that make leaks compile-time-detectable. Source: Microsoft .NET event design guidelines; Unity object lifetime documentation.

## C# exceptions

Throw the most specific exception that fits (`ArgumentNullException`, `InvalidOperationException`), not bare `Exception`. The type is information for the caller.
Catch only what you can handle. A `catch (Exception)` at a non-boundary is almost always wrong — it swallows bugs you didn't anticipate.
No empty catch blocks. Swallowing an exception turns a loud failure into silent corruption. If you genuinely intend to ignore, log and comment why.
Do not use exceptions for normal control flow — they are for exceptional conditions, not branching. Expected outcomes return values (`TryParse`, `Result`-style).
Rethrow with `throw;`, never `throw ex;` — the latter resets the stack trace and loses the origin.

**Why:** swallowed and mis-rethrown exceptions are the hardest production failures to diagnose — the symptom shows up far from the cause with no trace. Source: Microsoft .NET exception-handling guidance.

## C# generics and constraints

Apply the `struct` constraint (`where T : struct`) when a generic type parameter must be a value type and must never be boxed. Without it, the JIT emits a boxing path for any value type passed to an unconstrained generic. The `struct` constraint also rules out `null` and removes the need for null checks. (Source: Microsoft .NET generics performance guidance)
Add an interface constraint (`where T : IFoo`) only when the method body actually calls members of `IFoo`. A constraint that exists for documentation or future use adds cognitive cost, tightens coupling, and forces callers to implement the interface. If a type currently needs only one behavior, accept the specific type, not a constrained `T`. Concrete interface seams that vary by behavior should stay concrete; generics enter only where true type-parameterization is needed.
An interface constraint does NOT prevent boxing of value types. Calling an interface method on a constrained `T` where `T : IFoo` boxes the value type if the interface is not implemented via a `readonly` JIT-devirtualizable path. To avoid boxing: use `struct` + interface together (`where T : struct, IFoo`), which enables constrained-call devirtualization, or avoid the interface constraint on hot-path generics entirely. (Source: Microsoft .NET devirtualization and constrained call documentation)
Add the `new()` constraint only when the generic method or class actually calls `new T()`. It signals to callers that their type must have a public parameterless constructor — a real restriction. Do not add it speculatively; it rules out structs with required fields and classes with DI-only construction. (Source: Microsoft C# programming guide — constraints on type parameters)
When a seam will only ever be parameterized with a small, known set of types, prefer a concrete interface over a generic type parameter. A generic here adds indirection without payoff and can obscure intent. Generics earn their place when the implementation is genuinely type-independent and callers supply varied types. Interfaces that vary by behavior rather than by data type need no generic.
Value types used as dictionary keys or in `HashSet<T>` must implement `IEquatable<T>` and override `GetHashCode` with a stable, collision-resistant hash. Without `IEquatable<T>`, the generic collection falls back to the boxed `object.Equals` path, negating the allocation advantage of a struct key. Use `HashCode.Combine` for deterministic composite hashes. A struct key that overrides `GetHashCode` and `object.Equals` but omits `IEquatable<T>` hits the boxing path on every lookup; implementing `IEquatable<T>` is the fix.
Apply covariance (`out`) and contravariance (`in`) only on generic interface and delegate type parameters, not on classes. A covariant `IEnumerable<out T>` makes read-only collections assignment-compatible; a contravariant `IComparer<in T>` makes comparers composable. Use variance when it models a real substitution relationship; do not add it speculatively. (Source: Microsoft .NET covariance and contravariance documentation)

**Why:** Unconstrained generics on hot-path structs box silently — the allocation appears nowhere in code but shows up as GC pressure in profiling. Correctly constrained generics (`struct, IFoo`) enable the JIT's constrained-call devirtualization, which eliminates both the virtual dispatch and the boxing penalty. Source: Microsoft .NET generics and JIT devirtualization documentation.

## C# naming

| Element | Convention |
| --- | --- |
| Types | `PascalCase` |
| Methods / Properties | `PascalCase` |
| Private fields | `_camelCase` |
| Local variables | `camelCase` |
| Constants | `PascalCase` |
| Parameters | `camelCase` |
| Events | `OnEventName` |

**Why:** consistency across the surface makes intent visible. Private vs public vs local at a glance.

## C# nullable reference types

Nullable reference types are enabled project-wide (`<Nullable>enable</Nullable>`). Nullability is part of the type, not a runtime guess.
Annotate intent with `?`. A `string` is non-null by contract; a `string?` may be null. Let the compiler enforce it instead of defensive null checks everywhere.
Do not use the null-forgiving operator `!` as a habit — it suppresses a real warning. Reserve it for the rare case where you know more than the flow analysis and document why.
Guard nullable inputs at public boundaries (`ArgumentNullException.ThrowIfNull(x)`). Internal code then trusts the non-null contract.

**Why:** NRTs move null-reference exceptions from runtime to compile time — but only if `!` isn't used to silence the very warnings that catch them. Source: Microsoft .NET nullable-reference-types guidance.

## C# Unity interop — async/disposal exceptions under the Unity runtime

Do not expose `Task`-returning async methods from `MonoBehaviour` subclasses. Unity's coroutine scheduler and the physics/rendering pipeline run on the main thread with no synchronization context; an awaited `Task` resumed on a thread pool thread will crash on any `UnityEngine` API call. Use coroutines (`IEnumerator` + `StartCoroutine`) for frame-linked async work; reserve `Task`/`UniTask` for engine-free code called from the main thread.
When frame-cadence matters (wait one frame, wait until end of frame, `WaitForSeconds`), coroutines are the correct primitive — not `Task.Delay`. `yield return new WaitForEndOfFrame()` and `yield return new WaitForSeconds(t)` integrate with Unity's time system; `Task.Delay` does not.
Subscribe to events in `OnEnable`; unsubscribe the matching handler in `OnDisable`. Never subscribe in `Start` or `Awake` and leave no matching unsubscribe — a disabled (not destroyed) `MonoBehaviour` still receives events subscribed outside the Enable/Disable bracket.
`MonoBehaviour` objects are not `IDisposable` — Unity controls their lifetime via `OnDestroy`. Release native resources (`ComputeBuffer`, `RenderTexture`, native plugins) in `OnDestroy`, not in `Dispose`. Engine-free helper classes that own resources should still implement `IDisposable` per the general rule; the MonoBehaviour that owns them calls `Dispose` in `OnDestroy`.
Use `Time.unscaledDeltaTime` for timers that must tick while game time is paused or scaled (UI countdowns, death timers, grounding-delay after landing). `Time.deltaTime` returns 0 when `Time.timeScale = 0`.
Do not mix `async void` with coroutines in the same class — an unhandled exception in `async void` escapes all try/catch and tears down the app silently. Unity event handlers that need async work start a coroutine or fire-and-forget to a static `Task` entry point that logs exceptions. The general `no async void except event handlers` rule still applies; in Unity, prefer coroutines for Unity-lifecycle work and save `async void` only for UnityEvent wired in the Inspector.
All `UnityEngine` namespace calls must occur on the main thread. Do not call `Destroy`, `Instantiate`, `GetComponent`, or any `Transform`/`Rigidbody` setter from a background thread or a `Task` continuation that did not explicitly marshal back with `UnityMainThreadDispatcher` or equivalent. Engine-free domain classes are safe to call from any thread.

**Why:** Unity's runtime is not thread-safe for scene-graph operations, and its coroutine scheduler is frame-coupled, not awaitable. Mixing the two models produces race conditions, NullReferenceExceptions on background threads, and silent data corruption with no stack trace. The general `csharp/async.md` rules hold for engine-free code; this file documents the Unity-specific exceptions and cross-references the Unity subsystem rules. Source: Unity scripting thread-safety documentation and Microsoft .NET async guidance.

## C# value types and allocation discipline

Use `struct` for small (≤ 16 bytes as a guideline), immutable, short-lived data carriers with no identity — position, direction, colour, query results. Use `class` when identity, inheritance, or large size is required. The struct/class boundary is a performance contract: structs copy on assignment; classes share by reference.
Declare data-carrier structs `readonly struct` whenever all fields are `readonly`. This prevents accidental mutation through defensive copies the compiler inserts on `in`/`readonly` variables, and signals immutability at the declaration site. A data-carrier struct with all-readonly fields that is not declared `readonly struct` is the anti-pattern.
Pass structs larger than a register pair (> ~16 bytes, or any struct holding reference-type fields) with the `in` modifier to avoid copying. The call site reads cleanly; the compiler enforces no mutation.
Never allocate heap objects in per-frame paths (`Update`, `FixedUpdate`, `OnDrawGizmos`, physics callbacks). Every allocation is a future GC collection. Reuse buffers, pre-allocate lists, and use `stackalloc` / `Span<T>` for transient scratch. Allocating a collection (e.g. a `HashSet<>`) inside a per-frame callback is the pattern to avoid in hot paths.
Use `Span<T>` and `stackalloc` for transient, fixed-size buffers in hot paths — direction lookups, vertex scratch, small sort buffers. `Span<T>` cannot escape to the heap (the compiler enforces this), so it carries no GC cost and aliases the stack or an existing array without copying. Prefer it over `new T[]` for sub-100-element scratch.
`ComputeBuffer`, `NativeArray<T>`, and `GraphicsBuffer` are unmanaged. Create them outside the hot loop (in `Start` / `Awake` / on demand with lazy init), reuse across frames, and release in `OnDestroy` / `Dispose`. Never allocate inside `Update` or a per-vertex loop. Creating and releasing such buffers per call is acceptable for editor-time generation; in a real-time path they must be pre-allocated fields.
Avoid boxing in per-frame code: do not pass `struct` as `object`, do not call non-generic collection methods on value types, do not use `Enum` values with non-generic APIs. Boxing allocates a heap object. Use generic collections (`List<T>`, `Dictionary<TKey,TValue>`) and constrained generics to stay allocation-free. A struct dictionary key without `IEquatable<T>` relies on boxing via the `object.Equals` override; implement `IEquatable<T>` on the struct for zero-alloc lookup.
Struct dictionary keys must implement `IEquatable<T>` and override `GetHashCode` deterministically. Without `IEquatable<T>`, the dictionary calls the boxed `object.Equals` path, defeating the perf benefit of a struct key. A struct key that overrides `GetHashCode` and `object.Equals` but omits `IEquatable<T>` hits the boxing path on every lookup.

**Why:** In a game loop running at 60-120 Hz, a 100 B/frame allocation rate yields 7-12 KB of garbage per second — enough to trigger incremental GC stalls at high allocation volumes. Struct data carriers, Span<T> scratch, and pre-allocated buffers are the three levers that eliminate frame-time GC spikes without profiler heroics. Source: Microsoft .NET performance guidelines, Unity scripting optimization docs.
