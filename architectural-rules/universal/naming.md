---
name: Naming (universal)
description: Filename matches type name; one type per file; no V2/New/Final suffixes — replace or rename to _OLD; booleans prefixed Is/Has
type: user
kind: architectural-rule
scope: [naming, universal]
relevance: always
---

- <!-- id: one-type-per-file --> One type per file, filename matches the type — where the language's file idiom supports it.
- <!-- id: no-versioning-suffixes --> No versioning suffixes in names: `New`, `V2`, `Final`, `Redesigned`. If an old version must coexist, rename the old one to `<Name>_OLD` and delete once the new one is proven.
- <!-- id: boolean-predicate-prefix --> Booleans read as a predicate. Prefix `Is` / `Has` (or `Can` / `Should` where it reads better) on boolean members, properties, and functions returning a boolean: `IsReady`, `HasPendingWrites`, `CanRetry`. Not `ready`, `pending`, `flag`, `status`. Applies to the language's casing — `is_ready` in snake_case languages. Negated names are banned: `IsNotReady` inverts at every call site.
- <!-- id: language-specific-casing --> Language-specific casing and file-layout idioms live in per-language rules under `<lang>/naming.md` and win.

**Why:** suffixes like `V2` become permanent; `_OLD` is a visible debt you cannot ignore. A bare `ready` reads as a noun at the call site, so `if (thing.ready)` is ambiguous between a state object and a boolean — the predicate prefix removes the guess.
