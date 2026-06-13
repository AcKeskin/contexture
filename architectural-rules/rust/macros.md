---
name: Rust macros
description: Input syntax evocative of output. Compose with attributes. Item macros work where items do, support visibility, accept flexible type fragments.
type: user
kind: architectural-rule
scope: [rust, macros]
relevance: when-language-rust
---

- Input syntax is evocative of the output (C-EVOCATIVE). A macro that defines a struct should look like a struct definition; a macro that builds a value should look like a constructor expression. The reader should be able to predict the expansion shape without consulting docs.
- Macros compose with attributes (C-MACRO-ATTR). `#[derive(...)]`, `#[cfg(...)]`, `#[doc = "..."]` placed on a macro invocation must reach the items that the macro produces. Forward `$(#[$attr:meta])*` patterns through the expansion.
- Item macros work anywhere items are allowed (C-ANYWHERE) — module scope, inside `impl` blocks, inside functions, inside other macros. Test invocation in each context; avoid relying on top-level-only assumptions.
- Item macros support visibility specifiers (C-MACRO-VIS). Accept `$vis:vis` and forward it: `macro_rules! my_macro { ($vis:vis struct $name:ident ...) => { $vis struct $name ... }; }`. Don't hardcode `pub` or assume private.
- Type-position fragments are flexible (C-MACRO-TY). Use `$t:ty` for types, `$($t:tt)*` for token sequences when `:ty` is too restrictive. Generic parameters, lifetimes, and complex paths must all parse.

**Why:** macros that violate these rules become foreign objects in their own crate — they don't compose with `#[derive]`, can't be used in expected positions, and surprise users. The `vec![]`, `println!`, and `dbg!` macros set the bar; declarative macros that fall below it feel broken.
