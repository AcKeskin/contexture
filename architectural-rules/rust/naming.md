---
name: Rust naming
description: RFC 430 casing. as_/to_/into_ conversions. iter/iter_mut/into_iter on collections. Iterator types match producing methods.
type: user
kind: architectural-rule
scope: [rust, naming]
relevance: when-language-rust
---

- Casing per RFC 430 (C-CASE): `UpperCamelCase` for types/traits/enum variants, `snake_case` for crates/modules/functions/locals, `SCREAMING_SNAKE_CASE` for constants/statics. Acronyms are one word — `Uuid` not `UUID`, `Io` not `IO`.
- Ad-hoc conversions follow `as_` / `to_` / `into_` (C-CONV):
  - `as_` — free, borrowed → borrowed (e.g. `String::as_str`).
  - `to_` — expensive, borrowed → owned (e.g. `[T]::to_vec`, `str::to_string`).
  - `into_` — owned → owned, consumes self (e.g. `String::into_bytes`).
- Getters do not use `get_` prefix (C-GETTER). `foo.name()`, not `foo.get_name()`. Reserve `get_` for the `Index`-like sense where it returns `Option`/`Result` (`HashMap::get`).
- Collections producing iterators expose `iter`, `iter_mut`, `into_iter` (C-ITER), returning `&T`, `&mut T`, `T` respectively. Implement the corresponding `IntoIterator` impls on `&Coll`, `&mut Coll`, `Coll`.
- Iterator type names mirror the producing method (C-ITER-TY): `vec.iter()` → `vec::Iter`, `map.values_mut()` → `map::ValuesMut`. No bare `Iterator` type names.
- Cargo feature names are free of placeholder words (C-FEATURE). No `use-foo`, `with-bar`, `no-baz` — just `foo`, `bar`. Negative features only when unavoidable.
- Names use consistent word order across the crate (C-WORD-ORDER). Pick `<Verb><Noun>` or `<Noun><Verb>` and stick to it (e.g. all `*Error` types end in `Error`, not some `Error*`).

**Why:** Rust's stdlib establishes these conventions and users pattern-match on them. A crate that violates them looks broken even when it isn't, and IDE completion / docs become harder to navigate.
