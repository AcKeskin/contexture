---
name: C++ move semantics
description: Rule-of-zero/five for resource-owning types, noexcept move, zero-out after move, delete copy for move-only GPU/OS handles.
type: user
kind: architectural-rule
scope: [cpp, move-semantics]
relevance: when-language-cpp
origin: shipped
---

<!-- id: rule-of-zero --> Prefer the Rule of Zero: compose resource ownership through RAII members (`unique_ptr`, a move-only buffer wrapper, etc.) so the compiler generates all five special members correctly. Write Rule-of-Five only when the class directly owns a raw OS or GPU handle. (C.20)
<!-- id: rule-of-five-complete --> When you write any of destructor, copy-ctor, copy-assign, move-ctor, move-assign, define or `= delete` all five. A destructor alone suppresses generated move. (C.21)
<!-- id: delete-copy-for-handles --> Delete copy for types that own a unique GPU or OS handle — copy would alias the handle and cause double-free. (C.81)
<!-- id: noexcept-move --> Mark move constructor and move-assignment `noexcept`. STL containers call the move path only when `noexcept`; without it, `std::vector` of a handle-owning type copies instead of moves. (C.66)
<!-- id: zero-after-move --> In the move constructor/assignment, null-out the source handle immediately after transferring it. The source destructor must be a no-op on the zeroed state (`other.handle = 0;`).
<!-- id: self-assign-guard --> In move-assignment, guard against `this == &other` before releasing the current resource — otherwise you destroy the handle before reading it from `other`.
<!-- id: no-needless-copy --> Pass sink parameters by value and `std::move` into storage (forwarding pattern). Pass read-only parameters by const-ref. Never copy a resource-owning type where a move or reference suffices. (F.15, F.18)
<!-- id: shared-ptr-not-default --> `shared_ptr` is not a default for GPU/OS resource ownership — it pays reference-count overhead and hides the ownership graph. Use `unique_ptr` or a move-only RAII wrapper when exactly one owner exists; reserve `shared_ptr` for genuinely shared lifetimes. (R.20, R.21)

**Why:** moving handle types (`GLuint`, `HMODULE`, fds) instead of copying prevents double-free and alias bugs that appear only under destruction order. `noexcept` on moves is load-bearing for STL container reallocation. Source: C++ Core Guidelines (C.20, C.21, C.66, C.81, F.15, F.18, R.20, R.21).
