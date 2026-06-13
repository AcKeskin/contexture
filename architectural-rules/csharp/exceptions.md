---
name: C# exceptions
description: Throw specific / catch specific, no swallow, no exception-as-control-flow, preserve stack traces with throw;.
type: user
kind: architectural-rule
scope: [csharp, exceptions, errors]
relevance: when-language-csharp
origin: shipped
---

<!-- id: throw-specific --> Throw the most specific exception that fits (`ArgumentNullException`, `InvalidOperationException`), not bare `Exception`. The type is information for the caller.
<!-- id: catch-specific --> Catch only what you can handle. A `catch (Exception)` at a non-boundary is almost always wrong — it swallows bugs you didn't anticipate.
<!-- id: no-swallow --> No empty catch blocks. Swallowing an exception turns a loud failure into silent corruption. If you genuinely intend to ignore, log and comment why.
<!-- id: no-control-flow --> Do not use exceptions for normal control flow — they are for exceptional conditions, not branching. Expected outcomes return values (`TryParse`, `Result`-style).
<!-- id: preserve-stack --> Rethrow with `throw;`, never `throw ex;` — the latter resets the stack trace and loses the origin.

**Why:** swallowed and mis-rethrown exceptions are the hardest production failures to diagnose — the symptom shows up far from the cause with no trace. Source: Microsoft .NET exception-handling guidance.
