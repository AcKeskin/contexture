---
name: Code standards
description: Small testable units, deterministic behavior, explicit errors, no dead code, no speculative abstractions
type: user
kind: architectural-rule
scope: [code-standards, universal]
relevance: always
---

- <!-- id: small-testable-units --> Small, testable units. If a function needs prose to explain, it is too big.
- <!-- id: deterministic-behavior --> Deterministic behavior. No hidden time / random / env dependencies in pure logic.
- <!-- id: explicit-error-handling --> Explicit error handling. No silent catch-and-ignore. Every error path is intentional.
- <!-- id: no-dead-code --> No dead code. No commented-out code in the code you write — delete it, git remembers. (Pre-existing: change-discipline.)
- <!-- id: no-speculative-abstractions --> No speculative abstractions. Build for the concrete requirement; generalise when the second use case arrives, not the first.
- <!-- id: no-temporary-solutions --> No "temporary" solutions. Temporary code outlives permanent code.

**Why:** each of these defers cost. Every violation turns into a debugging session later.
