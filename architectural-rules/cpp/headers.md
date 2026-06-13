---
name: C++ headers
description: Headers minimal. Include what you use. Forward declare where possible. No logic in headers beyond trivial/constexpr.
type: user
kind: architectural-rule
scope: [cpp, headers]
relevance: when-language-cpp
---

- Headers minimal. Include what you use; no transitive-include reliance.
- Forward declare where possible. Full include only when the type's size or members are needed.
- `.h` owns the contract (declarations, public interface).
- `.cpp` owns implementation.
- No logic in headers unless trivial inline accessors or `constexpr`. Templates are the exception — implementation must live in the header, keep it self-contained.

**Why:** header bloat is the dominant cost of C++ build times. Each unnecessary include is paid by every TU that transitively pulls it in.
