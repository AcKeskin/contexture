---
name: Rust flexibility
description: Expose intermediate results. Caller decides allocation. Generics over concrete types. Object-safe traits when they may be used as dyn Trait.
type: user
kind: architectural-rule
scope: [rust, api-design, generics]
relevance: when-language-rust
---

- Functions expose intermediate results to avoid duplicate work (C-INTERMEDIATE). If `do_big_thing` internally computes `x` and then `f(x)`, expose `compute_x` and `apply_f` so callers who already have `x` don't pay for it twice. The convenient combined function still exists, but the building blocks are public.
- Caller decides where to copy and place data (C-CALLER-CONTROL). Take `&str` not `String`, `&[T]` not `Vec<T>`, `impl AsRef<Path>` not `PathBuf` — let the caller choose owned vs borrowed. Allocate inside a fn only when the fn must own the result, and document it.
- Functions minimize assumptions about parameters using generics (C-GENERIC). `fn foo(reader: impl Read)` is more flexible than `fn foo(reader: File)`. But: don't go so abstract that error messages become unintelligible. Constrain to the minimal trait bound that the body actually uses.
- Traits that may be useful as `dyn Trait` are object-safe (C-OBJECT). No generic methods, no `Self: Sized` requirements on methods (use it on the trait or on individual methods that should be excluded from the vtable). When a trait genuinely needs generic methods, split into an object-safe trait + an extension trait.

**Why:** flexibility decisions are baked in at API definition. A fn that takes `String` instead of `&str` forces every caller to allocate; a non-object-safe trait forecloses dynamic dispatch forever. These are not "we can fix it later" — they're load-bearing structural choices.
