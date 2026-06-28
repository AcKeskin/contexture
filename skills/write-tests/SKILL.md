---
name: write-tests
description: Author a quality test suite for EXISTING code to a standard. Detects the project's test framework + conventions (reusing 079's extracted test conventions where present), proposes a confirmable test plan (cases + rationale) before writing, delegates idiomatic authoring to the scope's language-pro agent, and defaults to a characterization-with-flags stance — pins current behavior but flags suspicious-as-bug rather than enshrining it. Optionally runs the suite; on failure surfaces the test-vs-code discrepancy rather than auto-adjusting, and reports covered AND deliberately-not-covered. Use when the user types /write-tests or asks to write / add / author tests for existing code. Mode A only — never auto-fire.
---

# write-tests

The test-authoring organ. Fills the hole between [test-driven-development](../test-driven-development/SKILL.md) (the test-*first* workflow for *new* code) and the testability design rule (the code-side rule for making code testable): no organ today, pointed at *existing* code, authors a quality suite to a standard. `/write-tests` does. It writes to [`universal/test-quality.md`](../../architectural-rules/universal/test-quality.md) — the standard `/review` also audits against.

## When to run

- User types `/write-tests <target>` (or no arg → prompt for a target).
- Natural language: "write tests for this", "add tests for `Invoice`", "I need a test suite for the billing module".
- **Do not auto-fire.** Mode A, user-invoked. Authoring tests is a deliberate act. No hook, no session trigger. (Distinct from `test-driven-development`, which is the *workflow* you follow while writing new code — that one is invoked when you're about to build a feature; this one is pointed at code that already exists.)

## Inputs

- **Target** — a function, class, module, file, or directory. With no arg, prompt:

 > What should I write tests for? A function, class, file, or module.

- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Anchors framework detection, the 079 test-convention lookup, and where tests are written.
- **Per-plan and per-flag confirmations** — collected at the plan gate (§4) and on flagged-as-suspicious behaviors (§5). Collaborator principle — never author blind, never enshrine a suspected bug silently.

## Procedure

### 1. Resolve the target

Resolve the target argument to concrete code: a file, a symbol within a file (grep for the declaration), a directory (each file), or a module. If ambiguous, list candidates and ask. If the target has no testable surface (a pure constant file, generated code), say so and stop rather than authoring vacuous tests.

### 2. Detect framework + conventions

Determine **how this project tests**, in this precedence:

1. **079 extracted test conventions** — if `<project>/.claude/rules/<lang>/conventions.md` exists and has a test-conventions section, use it. It is the project's own observed style; conform to it.
2. **Existing tests** — read the project's existing test files. Detect the **framework** (xUnit / NUnit / MSTest, Jest / vitest / mocha, pytest / unittest, cargo test, GoogleTest, …), the **layout** (where tests live, file naming), and the **conventions** (test naming pattern, fixture/setup style, assertion library).
3. **Inference + confirm** — when neither is present, infer the most idiomatic framework + conventions for the language and surface them explicitly:

 > No existing tests or 079 conventions found. I'd use **<framework>** with **<naming/layout convention>** — confirm or correct before I plan?

4. **Zero-tests repo** — propose a framework + minimal setup (the dependency + a test directory + one example) as part of the confirm, so the user opts into the testing foundation deliberately.

**Never infer silently** — when detection falls to inference (step 3/4), the "I inferred these, confirm" note is mandatory.

### 3. Analyze the target → propose a confirmable test plan

Analyze the target for its **testable surface**: behaviors, inputs, output/effects, boundaries (empty / one / max / off-by-one edges), error paths, and branches. Then propose a **test plan** — the cases, each with a one-line rationale — for accept/edit/reject **before any test is written** (the 051/024 propose-confirm-commit gate):

```
## Test plan for <target> (framework: <fw>, conventions: <source>)

Proposed cases:
 1. <happy path> — <rationale: the nominal contract>
 2. <boundary: empty input> — <rationale: edge the branch at L… guards>
 3. <boundary: max / off-by-one> — <rationale>
 4. <error path: invalid arg> — <rationale: the throw at L…>
 5. <branch: the X==null path> — <rationale: uncovered branch>

Deliberately NOT covering:
 - <thing> — <why: trivial getter / framework-guaranteed / out of scope>

Accept / edit (add, drop, or reword cases) / reject?
```

The plan puts **coverage depth in the user's hands per-target** — consistent with the planning-depth rule's rejection of a fixed test-count ratio. **Nothing is authored until the plan is accepted.** Reject → nothing written.

### 4. Characterization-with-flags stance

For **existing, untested** code, the default stance is **characterization-with-flags**:

- **Pin current behavior** as the expected values — this is what makes the suite a safe-refactoring net: it captures what the code does *now* so a later change that alters behavior is caught.
- **BUT flag anything that looks like a bug** for the user to confirm, rather than silently asserting it correct. When the current behavior is plausibly wrong (an off-by-one that happens to "work", a swallowed error, a boundary that returns the wrong edge), the plan marks it:

 > ⚠ `calculateRetryBudget(0)` currently returns `-1`. That looks like a bug (a budget shouldn't be negative). Options:
 > (p)in — assert `-1` as current behavior with a `// FIXME: looks wrong, pinned to characterize` note
 > (f)ix-first — stop; you fix the code, then I test the corrected behavior
 > (e)xpected — `-1` is actually correct here (tell me why; I assert it plainly)

**Never bake a suspected bug into a test as "expected" silently.** Characterization pins behavior to enable refactoring; it does not bless behavior as correct. The flag is what keeps the suite from quietly enshrining a defect.

### 5. Author the tests (language-pro delegated)

On accept, the skill owns **what to test, to what standard, the plan**; the idiomatic **how** dispatches to the scope's **language-pro agent** (`c-sharp-pro`, `cpp-pro`, `rust-pro`, `react-pro`, …) where one exists.

Dispatch protocol — honors [[agent-scope-control-hard-not-prompt]] and [[subagent-recursion-caps]]:

- **Positive scope + hard placement**, never a "do NOT" fence. The prompt carries: the accepted test plan (cases + expected values, including any pinned-with-FIXME flags), the detected framework + conventions, and the `test-quality.md` standard. "Write xUnit tests for this C# class implementing exactly these cases with these expected values. Follow the project's convention: <…>. Standard: behavior-not-implementation, intention-revealing names, AAA, no interdependence. Output only the test file."
- **No further spawn** — the language-pro agent is a leaf (recursion cap).
- **Pass the plan, not a re-analysis mandate** — the agent writes the agreed cases idiomatically; it does not redesign the coverage or re-judge the flags.
- When **no language-pro agent exists** for the language, the skill authors the tests itself to the same standard — delegation is an idiom-quality optimization, not a hard dependency.

The skill validates the returned tests implement the accepted plan (case-for-case, expected values intact, flags preserved as FIXME-pinned) before writing them.

### 6. Optional run + report (surface-not-auto-fix, coverage honesty)

After writing, optionally run the authored suite (ask, or run when the framework's test command is known and cheap). Report pass/fail. **On a failure, surface the discrepancy — never auto-adjust the test to match the code:**

> Test `Withdraw_Overdraft_Throws` failed: expected `InsufficientFundsException`, got a `-50` balance (no throw). The test encodes the plan's intent; the code doesn't throw. Which is correct — should the code throw (code bug), or should the test expect the silent overdraft (my plan was wrong)?

This is the systematic-debugging posture: a failing test is a *question about which side is right*, not a prompt to paper over the test. Auto-changing the expected value to match observed output would defeat the entire purpose — it makes any code "pass."

**Coverage honesty** (the enumerable-audit discipline): the report ends by stating what was covered **and what was deliberately not**, with reasons:

> Covered: happy path, empty-input boundary, the null-customer branch, the overdraft error path.
> Did NOT cover: the logging side-effect (framework-guaranteed), the private `normalize` helper (tested via its public callers), concurrent access (out of scope — flag if you want it).

Never imply exhaustiveness. "Tests pass" means the authored cases pass, not that the target is fully verified.

### 7. Stop

Do not invoke `/review`, do not commit. The authored tests are the user's to run in CI and commit. Do not auto-run `/write-tests` again. If authoring hit **testability friction** (couldn't test a behavior without reaching into internals), surface that as a *testability* signal in the code (a 048 finding) rather than lowering the test standard to work around it.

## What write-tests does NOT do

- **Does not auto-fire.** Mode A only.
- **Does not author blind.** The confirmable test plan (§3) gates every write.
- **Does not enshrine suspected bugs.** Characterization pins behavior to enable refactoring; suspicious behavior is flagged for confirmation, never silently asserted correct.
- **Does not auto-adjust a failing test to match the code.** A failure surfaces a code-vs-test question (§6). Auto-matching defeats the purpose.
- **Does not claim exhaustiveness.** Reports covered AND deliberately-not-covered.
- **Does not re-judge coverage inside the language-pro agent.** The agent writes the accepted plan idiomatically; it does not redesign it.
- **Does not lower the standard to dodge testability friction.** Surfaces the friction as a code-design signal instead.
- **Does not replace `test-driven-development`.** That's the test-first workflow for new code; this authors tests for code that already exists.

## Relationship to other organs

- **test-driven-development** — the sibling workflow: test-*first* for new code. `/write-tests` is test-*after*, pointed at existing code. Both honor the same `test-quality.md` standard; the horizontal-vs-vertical ordering lesson governs the order within an authored suite (one behavior at a time).
- **testability design rule** — the code-side pair. `test-quality.md` is the test side; testability is the code side. When authoring hits friction, surface a testability finding rather than working around it.
- **review** — audits existing tests against `test-quality.md` (the same standard this writes to). `/write-tests` authors; `/review` audits.
- **convention-extraction** — supplies the project's extracted test conventions (framework, naming, layout) this conforms to where present.
- **rule-prime-hook** — primes `test-quality.md` under `when-writing-tests`, so the standard is in context before the suite is written.
- **language-pro agents** — own idiomatic test authoring (§5). Dispatched with positive scope + hard placement, no further spawn.

## Debug

- **Framework misdetected** — point `/write-tests` at the convention source explicitly, or add a 079 test-conventions entry. The "I inferred these, confirm" note is the catch-point.
- **Language-pro returned tests that drift from the plan** — the skill re-authors to the accepted plan rather than writing drifted tests; flag a recurring drift via `/capture`.
- **A flagged behavior keeps re-flagging** — if the user said "expected, here's why", that reason belongs in the test as a comment and, if durable, in the 079 conventions or a `/capture` note so the next run doesn't re-flag it.
