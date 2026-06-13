---
name: C# collections and LINQ
description: Deferred-execution awareness, materialize once, no double enumeration of IEnumerable, LINQ over loops where it reads clearer.
type: user
kind: architectural-rule
scope: [csharp, linq, collections]
relevance: when-language-csharp
origin: shipped
---

<!-- id: deferred-execution --> LINQ queries use deferred execution — they do not run until enumerated. The query captures variables by reference; the result reflects state at enumeration time, not definition time.
<!-- id: materialize-once --> Materialize with `ToList()` / `ToArray()` once when you need to iterate multiple times or capture a snapshot. Enumerating a query twice re-runs it.
<!-- id: no-double-enumeration --> Beware multiple enumeration of an `IEnumerable`, especially over DB/IO sources — each pass re-queries. Accept `IReadOnlyList<T>` / `IReadOnlyCollection<T>` in signatures when callers will enumerate more than once.
<!-- id: linq-over-loops --> Prefer LINQ over hand-rolled loops where it reads clearer (filter/project/aggregate). Drop back to a loop when the operation is imperative, has side effects, or the LINQ becomes harder to read than the loop.

**Why:** deferred execution and silent re-enumeration are the two LINQ footguns that turn a clean query into an N+1 or a stale snapshot. Source: Microsoft .NET LINQ guidance.
