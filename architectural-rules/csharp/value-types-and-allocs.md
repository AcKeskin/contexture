---
name: C# value types and allocation discipline
description: Struct vs class, readonly struct for immutable data carriers, and zero-alloc hot paths — critical in game loops where GC spikes kill frame rate.
type: user
kind: architectural-rule
scope: [csharp, value-types, performance]
relevance: when-language-csharp
origin: shipped
---

<!-- id: struct-for-data-carriers --> Use `struct` for small (≤ 16 bytes as a guideline), immutable, short-lived data carriers with no identity — position, direction, colour, query results. Use `class` when identity, inheritance, or large size is required. The struct/class boundary is a performance contract: structs copy on assignment; classes share by reference.
<!-- id: readonly-struct --> Declare data-carrier structs `readonly struct` whenever all fields are `readonly`. This prevents accidental mutation through defensive copies the compiler inserts on `in`/`readonly` variables, and signals immutability at the declaration site. A data-carrier struct with all-readonly fields that is not declared `readonly struct` is the anti-pattern.
<!-- id: in-parameter-for-large-structs --> Pass structs larger than a register pair (> ~16 bytes, or any struct holding reference-type fields) with the `in` modifier to avoid copying. The call site reads cleanly; the compiler enforces no mutation.
<!-- id: no-per-frame-heap-alloc --> Never allocate heap objects in per-frame paths (`Update`, `FixedUpdate`, `OnDrawGizmos`, physics callbacks). Every allocation is a future GC collection. Reuse buffers, pre-allocate lists, and use `stackalloc` / `Span<T>` for transient scratch. Allocating a collection (e.g. a `HashSet<>`) inside a per-frame callback is the pattern to avoid in hot paths.
<!-- id: span-for-stack-scratch --> Use `Span<T>` and `stackalloc` for transient, fixed-size buffers in hot paths — direction lookups, vertex scratch, small sort buffers. `Span<T>` cannot escape to the heap (the compiler enforces this), so it carries no GC cost and aliases the stack or an existing array without copying. Prefer it over `new T[]` for sub-100-element scratch.
<!-- id: native-buffer-lifetime --> `ComputeBuffer`, `NativeArray<T>`, and `GraphicsBuffer` are unmanaged. Create them outside the hot loop (in `Start` / `Awake` / on demand with lazy init), reuse across frames, and release in `OnDestroy` / `Dispose`. Never allocate inside `Update` or a per-vertex loop. Creating and releasing such buffers per call is acceptable for editor-time generation; in a real-time path they must be pre-allocated fields.
<!-- id: no-boxing-in-hot-path --> Avoid boxing in per-frame code: do not pass `struct` as `object`, do not call non-generic collection methods on value types, do not use `Enum` values with non-generic APIs. Boxing allocates a heap object. Use generic collections (`List<T>`, `Dictionary<TKey,TValue>`) and constrained generics to stay allocation-free. A struct dictionary key without `IEquatable<T>` relies on boxing via the `object.Equals` override; implement `IEquatable<T>` on the struct for zero-alloc lookup.
<!-- id: struct-cache-key-iequalable --> Struct dictionary keys must implement `IEquatable<T>` and override `GetHashCode` deterministically. Without `IEquatable<T>`, the dictionary calls the boxed `object.Equals` path, defeating the perf benefit of a struct key. A struct key that overrides `GetHashCode` and `object.Equals` but omits `IEquatable<T>` hits the boxing path on every lookup.

**Why:** In a game loop running at 60-120 Hz, a 100 B/frame allocation rate yields 7-12 KB of garbage per second — enough to trigger incremental GC stalls at high allocation volumes. Struct data carriers, Span<T> scratch, and pre-allocated buffers are the three levers that eliminate frame-time GC spikes without profiler heroics. Source: Microsoft .NET performance guidelines, Unity scripting optimization docs.
