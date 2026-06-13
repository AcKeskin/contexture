---
name: Modern C++ and RAII
description: C++17+ unless constrained. RAII mandatory for every resource.
type: user
kind: architectural-rule
scope: [cpp, raii, modern-cpp]
relevance: when-language-cpp
---

- Target C++17 or newer unless the project explicitly constrains to older.
- RAII mandatory. Every resource (memory, file handle, lock, socket, GPU resource) is owned by an object whose destructor releases it.
- No manual `new` / `delete` pairs at call sites. If you write `new`, wrap it in a smart pointer or RAII type immediately.
- No raw `malloc` / `free` in application code.

**Why:** resource leaks in C++ are the dominant source of bugs, and they are entirely preventable by construction.
