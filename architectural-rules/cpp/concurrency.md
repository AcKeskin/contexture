---
name: C++ concurrency
description: RAII locks only, scoped_lock for multiple locks, no unknown code under lock, atomics not volatile, avoid lock-free.
type: user
kind: architectural-rule
scope: [cpp, concurrency]
relevance: when-language-cpp
origin: shipped
---

<!-- id: raii-locks --> Use RAII lock guards (`std::lock_guard`, `std::scoped_lock`, `std::unique_lock`) — never bare `mutex.lock()` / `unlock()`. A manual unlock is skipped on every early return and every throw. (CP.20)
<!-- id: multi-lock --> Acquire multiple locks with `std::scoped_lock` (or `std::lock`) in one statement — it orders acquisition to avoid deadlock. Never hand-order two `lock_guard`s. (CP.21)
<!-- id: no-unknown-under-lock --> Never call unknown / user-supplied code while holding a lock — it may re-enter and deadlock, or block far longer than intended. (CP.22)
<!-- id: atomics-not-volatile --> Use `std::atomic` for cross-thread flags and counters. `volatile` is not a synchronization primitive — it has no memory-ordering guarantees. (CP.8)
<!-- id: avoid-lock-free --> Do not write lock-free code unless you must and have measured the need. Assume your lock-free code is wrong until proven otherwise with tooling. (CP.100)
<!-- id: minimize-sharing --> Minimize sharing of writable data. The cheapest concurrency bug is the one that can't happen because nothing is shared. (CP.3)

**Why:** concurrency bugs are non-deterministic and survive code review and most tests — RAII locking and atomics remove whole classes of them by construction. Source: C++ Core Guidelines (CP).
