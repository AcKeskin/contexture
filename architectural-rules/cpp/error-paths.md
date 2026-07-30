---
name: C++ error paths
description: Explicit error paths. No silent failure. Exceptions vs error codes is a project-level choice, but whichever is used is used consistently.
type: user
kind: architectural-rule
scope: [cpp, errors]
relevance: when-language-cpp
---

- <!-- id: cpp-error-paths-explicit --> Every error path is explicit and visible in the code. No silent `catch (...)` that swallows.
- <!-- id: cpp-error-strategy-consistent --> Choose one strategy per project: exceptions, error codes, `std::expected`, or a dedicated `Result` type. Do not mix without a deliberate reason (e.g. C-API boundary).
- <!-- id: cpp-destructors-nothrow --> Destructors do not throw.
- <!-- id: cpp-move-operations-noexcept --> `noexcept` on move constructors / move assignment where achievable — standard library containers depend on it.

**Why:** silent failures in C++ become corrupted state. Explicit errors are the minimum insurance against that. Source: C++ Core Guidelines (E.2, E.6, C.36, C.37).
