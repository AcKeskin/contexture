---
name: Deterministic resource release
description: Scarce resources (files, sockets, locks, handles, native/GPU memory) are released at a deterministic point via the language's scoped idiom — never left to GC or finalizer timing.
type: user
kind: architectural-rule
scope: [resources, universal]
relevance: during-execution, during-review
---

- <!-- id: scoped-release-idiom --> Acquire scarce resources behind the language's scoped-release idiom — RAII, `using`/`IDisposable`, `with`, `defer`, try-with-resources, `finally` — so release happens at a deterministic point the reader can see, not whenever a collector runs.
- <!-- id: release-owner-explicit --> Every resource has one visible owner responsible for releasing it. A resource that escapes its acquiring scope travels *with* its ownership — the receiver's release duty is stated, not assumed.
- <!-- id: release-on-error-paths --> Release holds on error paths too: the scoped idiom, not a manual call after the happy path, is what guarantees it.

**Why:** finalizer and GC timing are nondeterministic, so a leaked handle, connection, or lock fails far from the leak — under load, in production, as exhaustion rather than as a stack trace. Language scopes state the local mechanism (`csharp/disposal`, `cpp/modern-cpp-raii`, `python/errors-and-resources`, `rust/dependability`); this rule is the floor for languages without one. Source: C++ Core Guidelines R.1/E.6, .NET IDisposable guidance, PEP 343.
