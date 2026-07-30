---
name: C++ headers
description: Headers minimal. Include what you use. Forward declare where possible. No logic in headers beyond trivial/constexpr.
type: user
kind: architectural-rule
scope: [cpp, headers]
relevance: when-language-cpp
---

- <!-- id: cpp-minimal-headers --> Headers minimal. Include what you use; no transitive-include reliance.
- <!-- id: cpp-forward-declarations --> Forward declare where possible. Full include only when the type's size or members are needed.
- <!-- id: cpp-header-owns-contract --> `.h` owns the contract (declarations, public interface).
- <!-- id: cpp-source-owns-implementation --> `.cpp` owns implementation.
- <!-- id: cpp-no-header-logic --> No logic in headers unless trivial inline accessors or `constexpr`. Templates are the exception — implementation must live in the header, keep it self-contained.
- <!-- id: cpp-prefer-cpp-modules --> Where the toolchain supports C++20 modules, prefer a module interface unit; the include / forward-declare rules above govern header-based TUs.

**Why:** header bloat is the dominant cost of C++ build times. Each unnecessary include is paid by every TU that transitively pulls it in. Source: C++ Core Guidelines (SF.7, SF.8, SF.10, SF.11).
