---
name: C++ templates and generics
description: Constrain with concepts (C++20), SFINAE only when concepts can't, no function-template specialization, template impl in headers.
type: user
kind: architectural-rule
scope: [cpp, templates, generics]
relevance: when-language-cpp
origin: shipped
---

<!-- id: use-concepts --> Constrain every template parameter with a concept (C++20). Prefer the standard concepts (`std::integral`, `std::ranges::range`) before writing your own. (T.10)
<!-- id: meaningful-concepts --> A concept must express meaningful semantics, not just a syntactic shape. A naked `typename`-only constraint isn't a concept — it's an unconstrained template wearing a name. (T.20)
<!-- id: sfinae-last-resort --> Use SFINAE / `enable_if` only when concepts genuinely can't express the constraint. Concepts give readable errors; SFINAE gives a wall of substitution failures. (T.13x)
<!-- id: no-fn-template-spec --> Do not specialize function templates — overload instead. Function-template specialization interacts surprisingly with overload resolution. (T.144)
<!-- id: template-impl-in-header --> Template definitions live in the header (or an included `.tpp`/`.ipp`), not a `.cpp` — the definition must be visible at every instantiation point. Keep it self-contained.

**Why:** concepts turn template misuse into a one-line readable error at the call site instead of a screen of instantiation noise — they are the single biggest readability win in modern generic C++. Source: C++ Core Guidelines (T).
