---
name: Code standards
description: Small testable units, deterministic behavior, explicit errors, no dead code, no speculative abstractions
type: user
kind: architectural-rule
scope: [code-standards, universal]
relevance: always
---

- Small, testable units. If a function needs prose to explain, it is too big.
- Deterministic behavior. No hidden time / random / env dependencies in pure logic.
- Explicit error handling. No silent catch-and-ignore. Every error path is intentional.
- No dead code. No commented-out code. Delete it — git remembers.
- No speculative abstractions. Build for the concrete requirement; generalise when the second use case arrives, not the first.
- No "temporary" solutions. Temporary code outlives permanent code.

**Why:** each of these defers cost. Every violation turns into a debugging session later.
