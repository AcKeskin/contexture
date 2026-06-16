---
name: Test quality (universal)
description: Tests assert behavior not implementation; intention-revealing names; systematic edge/boundary/error coverage; mock at seams not internals; AAA clarity; no test interdependence. Plus the anti-pattern list. Pairs with the testability design rule (code side).
type: user
kind: architectural-rule
scope: [testing, universal]
relevance: during-review, when-writing-tests
---

The standard a test suite is authored and audited against. The *test* side of test quality; the *code* side (designing code to be testable — seams, injected dependencies, pure cores) is the testability rule. `/write-tests` writes to this standard; `/review` audits against it.

<!-- id: behavior-not-impl --> Tests assert **observable behavior**, not implementation. Assert what the unit *does* (return value, emitted event, state transition a caller can see), never how it does it (private fields, call order of internals). A test coupled to implementation breaks on every refactor and protects nothing.
<!-- id: intention-names --> Test names **reveal intention** — what behavior, under what condition, expecting what. `Withdraw_InsufficientFunds_Throws` over `Test3`. The name is the spec a reader scans first.
<!-- id: systematic-coverage --> Coverage is **systematic**, not happy-path-only: the nominal case, **boundaries** (empty, one, max, off-by-one edges), and **error paths** (invalid input, failure modes, exceptions). Branch and edge coverage is the point; line coverage is a byproduct.
<!-- id: honest-mocking --> Mock at **seams, not internals** — substitute true external dependencies (network, clock, filesystem, DB), not the collaborators inside the unit under test. Minimal, honest doubles; a test that mocks the thing it's testing asserts nothing.
<!-- id: aaa-clarity --> **Arrange–Act–Assert** structure, one logical behavior per test. The three phases are visually distinct; a reader sees setup, the single action, and the assertions at a glance.
<!-- id: no-interdependence --> **No test interdependence** — each test sets up its own state and passes in isolation and in any order. Tests that depend on execution order or shared mutable state fail mysteriously and can't be run in parallel.

<!-- id: anti-patterns --> **Anti-patterns** (the negative list — a test exhibiting these is a finding):
- **Brittle assertions** — asserting on exact whitespace, full object dumps, or internal structure that changes for reasons unrelated to the behavior.
- **Over-mocking** — mocking so much that the test exercises mocks talking to mocks, not real code.
- **Testing privates** — reaching into private members / internal helpers instead of the public surface.
- **Test interdependence** — order-dependent or shared-state-dependent tests.
- **One giant test** — a single test asserting a dozen unrelated behaviors; a failure tells you nothing about which broke.

**Why:** tests exist to let you change code with confidence. A test coupled to implementation, dependent on order, or mocking its own subject inverts that — it breaks on safe refactors and stays green on real regressions, training the team to ignore or delete it. The standard above is what keeps a suite a safety net rather than a maintenance tax. Pairs with the testability design rule: when authoring to this standard hits friction (can't test without reaching into internals), that's a *testability* signal in the code, surfaced — not a reason to lower the test standard.
