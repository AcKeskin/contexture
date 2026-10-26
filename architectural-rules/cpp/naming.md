---
name: C++ naming
description: Booleans read as a predicate — Is/Has/Can prefix on bool members and bool-returning functions. Casing follows the surrounding code.
type: user
kind: architectural-rule
scope: [cpp, naming]
relevance: when-language-cpp
origin: shipped
---

<!-- id: cpp-booleans-predicate --> Booleans read as a predicate. Prefix `Is` / `Has` (or `Can` / `Should` where it reads better) on `bool` members and on functions returning `bool`: `IsReady()`, `HasPendingFrames`, `CanPresent()`. Not `ready`, `pending`, `flag`, `status`. Match the file's casing — `is_ready` where the surrounding code is snake_case.
<!-- id: cpp-no-negated-booleans --> No negated boolean names: `IsNotReady`, `disabled`, `m_noVsync`. The reader inverts at every call site, and `if (!IsNotReady())` is a double negative. Name the positive and negate at the use.
<!-- id: cpp-casing-follows-file --> This corpus pins no C++ casing convention — the standard library, Google, and LLVM all differ. Follow the file, then the project. A project-tier `conventions.md` wins over both.

**Why:** a bare `bool ready;` reads as a noun at the call site, so `if (device.ready)` is ambiguous between a state object and a boolean. C++ makes this worse than most languages: implicit conversions mean a non-bool member with a noun name still compiles in the same `if`. The predicate prefix removes the guess. Casing is left open on purpose — inventing a house casing rule would fight every third-party C++ codebase.
