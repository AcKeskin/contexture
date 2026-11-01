# evals

Cases for `claude plugin eval` (Claude Code 2.1.269+). Each case is a prompt plus graders. Most check whether a skill fires on natural phrasing; two check that nothing fires when it shouldn't; one checks review quality.

Every run is a real model call on your account.

```sh
# trigger check, cheapest: one arm, one run per case (about $1)
claude plugin eval . --runs 1 --ablation none --trust-plugin --no-publish --scaffold

# with the no-plugin baseline, to see what the plugin adds (about $5)
claude plugin eval . --trust-plugin --no-publish --scaffold --max-cost-usd 8

# one case, or one tag
claude plugin eval . --case trigger-brainstorm --runs 6 --ablation none
claude plugin eval . --tag negative
```

`--scaffold` lets `review-finds-bug` write its `cart.js` (`context.scaffold_script` in its `case.yaml`). Without it that case runs on an empty folder.

Run it before and after changing a skill's `description`, and compare. A trigger grader (`tool_used: Skill`) is left out of the score in two-arm runs; it shows as a pass/fail indicator.

## Cases

| Case | Checks |
| --- | --- |
| `trigger-*` | the named skill fires on a natural request |
| `user-only-improve-prompt` | a user-only skill does not fire from natural phrasing |
| `unrelated-arithmetic` | nothing fires on an unrelated question |
| `review-finds-bug` | a review finds an off-by-one and cites the line |

## Baseline, 2026-11-01

3 runs per case, one arm, on `main` before the skill-anatomy description pass:

| Fires every time | Never fires |
| --- | --- |
| brainstorm, checkpoint, pre-push, recap, rules, work-state | capture, systematic-debugging, review |

- **capture** loses to Claude Code's built-in memory: on "remember that this repo uses pnpm" the model writes to its own memory directory instead.
- **review** and **systematic-debugging**: the model answers inline. The review still finds the bug (2 of 3 graders pass without the skill).
- **improve-prompt** is user-only (`disable-model-invocation: true`), so it was never a trigger case; it is now the user-only check.

The description pass kept these results, except brainstorm dropped to 2 of 3 until one quoted phrase came back (then 6 of 6).

## After the trigger fix, 2026-11-01

- **capture** 3 of 3: the description now says to use it instead of writing a memory file directly.
- **systematic-debugging** 3 of 3: the "skip when there is an obvious one-line fix" clause moved to the end, and flaky tests and retries are named.
- **review** still 0 of 3 on "Review cart.js for bugs", now with the file on disk. Two rewrites did not change it, so the description is unchanged; the model reviews one small file inline. Use `/review` for the full skill.
- brainstorm scored 2 of 3 on this run with no change to it: expect about one miss in three on borderline cases.
