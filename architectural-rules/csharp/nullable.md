---
name: C# nullable reference types
description: NRTs enabled project-wide, annotate intent with ?, no habitual null-forgiving !, guard nullable params at public boundaries.
type: user
kind: architectural-rule
scope: [csharp, nullable, null-safety]
relevance: when-language-csharp
origin: shipped
---

<!-- id: nrt-enabled --> Nullable reference types are enabled project-wide (`<Nullable>enable</Nullable>`). Nullability is part of the type, not a runtime guess.
<!-- id: annotate-intent --> Annotate intent with `?`. A `string` is non-null by contract; a `string?` may be null. Let the compiler enforce it instead of defensive null checks everywhere.
<!-- id: no-null-forgiving --> Do not use the null-forgiving operator `!` as a habit — it suppresses a real warning. Reserve it for the rare case where you know more than the flow analysis and document why.
<!-- id: guard-boundaries --> Guard nullable inputs at public boundaries (`ArgumentNullException.ThrowIfNull(x)`). Internal code then trusts the non-null contract.

**Why:** NRTs move null-reference exceptions from runtime to compile time — but only if `!` isn't used to silence the very warnings that catch them. Source: Microsoft .NET nullable-reference-types guidance.
