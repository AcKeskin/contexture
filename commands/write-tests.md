---
description: Author a quality test suite for existing code to a standard — detect framework + conventions, propose a confirmable test plan, author via the scope's language-pro agent, characterization-with-flags stance, surface-not-auto-fix on failures
---

Run the `write-tests` skill for the current context.

`/write-tests <target>` authors a quality test suite for *existing* code (a function, class, module, or file). Examples:

- `/write-tests` — prompts for a target.
- `/write-tests src/billing/Invoice.cs` — tests that file.
- `/write-tests calculateRetryBudget` — tests that function.

The skill detects the project's test framework + conventions (reusing 079's extracted test conventions where present), proposes a test plan (cases + rationale) for your accept/edit/reject before writing anything, then delegates idiomatic authoring to the scope's language-pro agent. Its default stance is **characterization-with-flags**: it pins the code's current behavior as tests (so you can refactor safely) but flags anything that looks like a bug for you to confirm rather than silently asserting it correct. Optionally runs the suite; on a failure it surfaces the test-vs-code discrepancy rather than auto-adjusting, and reports what it covered AND what it deliberately did not.

Mode A only — never auto-fires. See `~/.claude/skills/write-tests/SKILL.md` for the full procedure.
