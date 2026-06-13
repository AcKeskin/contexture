---
name: Rust predictability
description: Smart pointers don't add inherent methods. Conversions on the specific type. No out-params. Constructors are inherent static fns. Deref only for smart pointers.
type: user
kind: architectural-rule
scope: [rust, api-design]
relevance: when-language-rust
---

- Smart pointers do not add inherent methods (C-SMART-PTR). `Box`, `Rc`, `Arc` only expose associated functions called via `Type::fn(&value)` (e.g. `Rc::clone(&x)`, `Arc::strong_count(&x)`) — never `value.fn()` — to avoid colliding with methods on the pointee. Apply this discipline to your own smart-pointer types.
- Conversions live on the most specific type involved (C-CONV-SPECIFIC). `impl From<Foo> for Bar` lives in the module that defines `Bar` if `Bar` is more specific, otherwise next to `Foo`. Don't scatter conversion impls.
- Functions with a clear receiver are methods, not free functions (C-METHOD). `string.len()`, not `len(string)`. Free functions are for things without an obvious owner.
- Functions do not take out-parameters (C-NO-OUT). Return tuples or structs instead of `&mut T` parameters used for output. `fn split(s: &str) -> (&str, &str)` not `fn split(s: &str, head: &mut &str, tail: &mut &str)`.
- Operator overloads are unsurprising (C-OVERLOAD). `+` does what `+` does on numbers — no clever string concatenation tricks, no `<<` for "send to". Implement operator traits only when the meaning is obvious from the math/algebra of the type.
- Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). `Deref` is *not* a "free inheritance" mechanism — abusing it for a base-class effect breaks method resolution and confuses readers. If you reach for `Deref` and the type isn't a pointer, stop.
- Constructors are static inherent methods, not trait methods or free functions (C-CTOR). `Foo::new(...)`, `Foo::with_capacity(...)`, `Foo::from_parts(...)`. Reserve `Default::default()` for the empty/zero case.

**Why:** Rust users have strong priors about how an API behaves based on these patterns. Violating them is technically legal and operationally hostile — every call site needs a comment to explain why the obvious reading is wrong.
