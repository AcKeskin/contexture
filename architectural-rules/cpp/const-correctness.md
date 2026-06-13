---
name: C++ const-correctness
description: const by default, const member functions, const& params for non-trivial types, constexpr for compile-time values.
type: user
kind: architectural-rule
scope: [cpp, const, const-correctness]
relevance: when-language-cpp
origin: shipped
---

<!-- id: const-by-default --> Declare objects `const` unless the value must change. Immutable-by-default makes the few mutable things visible and lets the compiler enforce the rest. (Con.1)
<!-- id: const-members --> Make member functions `const` when they don't modify observable state. A non-`const` method is a claim that it mutates — don't make that claim falsely. (Con.2)
<!-- id: const-ref-params --> Pass non-trivial types by `const&` (or `const*`) when you only read them — no copy, no mutation. Pass by value only for cheap-to-copy types or when you need an owned copy anyway. (Con.3)
<!-- id: constexpr --> Use `constexpr` for values computable at compile time — they cost nothing at runtime and can be used in constant contexts (array sizes, template args). (Con.5)

**Why:** const-correctness is contract documentation the compiler checks — it propagates through call sites and catches accidental mutation at compile time, for free. Source: C++ Core Guidelines (Con).
