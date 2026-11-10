# Review calibration

Measures how often a review misses a real bug and how often it reports one that is not there. A review that over-flags looks fine case by case, and gets ignored. Adapted from the calibration mode in `Imbad0202/academic-research-skills` (read 2026-11-08).

## The set

Tag `review-calibration`. Same prompt shape in every case: "Review <file> for bugs. Report findings only."

| Case | Kind | The right answer |
| --- | --- | --- |
| `review-finds-bug` | bug | off-by-one in a loop |
| `review-cal-null-deref` | bug | `find` can return undefined, next line reads a field |
| `review-cal-async-foreach` | bug | async callback in `forEach`, function returns before the writes |
| `review-cal-numeric-sort` | bug | `sort()` with no comparator on numbers |
| `review-cal-sql-injection` | bug | query string built from request input |
| `review-cal-clean-slugify` | clean | no Critical or High finding |
| `review-cal-clean-paginate` | clean | no Critical or High finding |

Low notes and questions on a clean file are allowed. A clean case fails only on a Critical or High claim, or "this is broken".

## Run

```sh
# one arm, 3 runs per case (about 21 runs)
claude plugin eval . --tag review-calibration --runs 3 --ablation none --trust-plugin --no-publish --scaffold

# with the no-plugin baseline
claude plugin eval . --tag review-calibration --runs 3 --trust-plugin --no-publish --scaffold --max-cost-usd 10
```

`--scaffold` is required: each case writes its file with `scaffold.sh`.

## Score

- **Miss rate** = failed runs on bug cases / all runs on bug cases. For `review-finds-bug`, count only its `finds-off-by-one` grader; its other two graders check the skill fired and the line cite, not a miss.
- **False-alarm rate** = failed runs on clean cases / all runs on clean cases.

| metric | bar | if missed |
| --- | --- | --- |
| miss rate | under 15% | the change made review weaker; do not ship it |
| false-alarm rate | under 10% | the change made review noisier; do not ship it |

With 15 bug runs and 6 clean runs one failure moves a rate a lot: read a result as a direction, not a statistic. Run before and after any change to `skills/review/` and compare. For a paid A/B, fill in [PREREG.md](PREREG.md) first.

## Adding a case

Keep the file small and the bug (or its absence) clear from the file alone. Name files like a real project (`notify.js`, not `bug1.js`): the model must not see that it is tested. A new clean case should hold something a reviewer might wrongly flag, and its grader should name the likely false claims.
