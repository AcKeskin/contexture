---
name: C++ error paths
description: Explicit error paths. No silent failure. Exceptions vs error codes is a project-level choice, but whichever is used is used consistently.
type: user
kind: architectural-rule
scope: [cpp, errors]
relevance: when-language-cpp
---

- Every error path is explicit and visible in the code. No silent `catch (...)` that swallows.
- Choose one strategy per project: exceptions, error codes, `std::expected`, or a dedicated `Result` type. Do not mix without a deliberate reason (e.g. C-API boundary).
- Destructors do not throw.
- `noexcept` on move constructors / move assignment where achievable — standard library containers depend on it.

**Why:** silent failures in C++ become corrupted state. Explicit errors are the minimum insurance against that.
