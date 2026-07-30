---
name: C++ ownership semantics
description: Clear ownership. unique_ptr default. shared_ptr only when shared ownership is real. Raw pointers only as non-owning views.
type: user
kind: architectural-rule
scope: [cpp, ownership]
relevance: when-language-cpp
---

- <!-- id: cpp-unique-ptr-default --> `std::unique_ptr` is the default for heap-owned resources. Single owner, move semantics.
- <!-- id: cpp-shared-ptr-when-needed --> `std::shared_ptr` only when ownership is genuinely shared and lifetime cannot be expressed with a single owner. Every `shared_ptr` is a design claim — justify it.
- <!-- id: cpp-raw-pointers-views-only --> Raw pointers only as non-owning views or short-lived parameters. Never for ownership.
- <!-- id: cpp-no-hidden-globals --> No hidden globals or singletons without a strong, documented reason. Prefer dependency injection.

**Why:** ownership confusion is the second-largest source of C++ bugs after lifetimes. Make it impossible to get wrong. Source: C++ Core Guidelines (R.20, R.21, R.30, I.11).
