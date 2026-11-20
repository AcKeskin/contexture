# Before a paid bench: write the bars first

For any A/B that spends money: `claude plugin eval`, a sandbox bench like the 2026-11-03 plugin bench, or a micro-test of one skill line. Copy the template into the bench folder and fill it in **before the first priced run**. Commit it, or at least save it, before any results exist.

## Template

```markdown
# <bench name>, <date>

## Question
<the one decision this bench informs: ship X, keep Y, drop Z>

## Arms
- baseline: <no plugin, or main>
- <arm>: <what changes, commit>

## Bars
| metric | pass bar | direction | if missed |
| --- | --- | --- | --- |
| <hidden tests passed> | <7/7 in every run> | higher | <don't ship> |

## Decoys
<inputs where the right result is "nothing" or "no change": how many, what a pass on them proves>

## Stop rules
- spend cap: $<N>
- stop after the pilot if a bar is clearly missed
- stop on the first rate-limit or auth error

## Pilot
3 runs per arm. Projected cost for the full run: $<pilot mean × runs>, ±<spread>.

## Run order
<A, B, A, B, …> or <control, candidate, control, …>

## Ledger
| # | arm | commit | result | cost | note |
| --- | --- | --- | --- | --- | --- |
```

## Rules

- **Bars before results.** A bar written after you saw a result is a guess fitted to it. Changing a bar after the pilot starts makes it a new bench with a new file.
- **Always a baseline arm.** Without the no-plugin (or `main`) arm, nothing says what the change added.
- **Interleave the arms.** Run A, B, A, B (or control, candidate, control), never all of A then all of B: model, API and machine drift over a session then hits both arms the same. With `claude plugin eval`, which orders its own arms, run one arm per call (`--ablation none` on `main`, then on the change) and alternate the calls.
- **Beat both sides.** A candidate run counts as a win only if it beats the control run before it and the one after it. If either neighbour is as good, it is not a win. A win that makes another bar worse by more than about 3% is not accepted either.
- **Log every run.** Each run gets a ledger row the moment it ends, failed, timed-out and rate-limited runs too, with the reason. Leaving a bad run out of the ledger is changing the result.
- **Pilot first.** 3 runs per arm, then project the full cost and look at the bars. Only then run the rest.
- **The agent must not see that it is being tested.** No `eval`, `test`, `bench`, `fixture`, `hidden`, `judge` or `arm` in the folder names, file names, prompts or env the agent can read. Name the folder like a real project (`shop-service/`, not `fixture/`). A project's own `tests/` folder is fine when the task is about those tests.
- **Grade blind.** A model judge sees answers as A and B, never the arm name.
- **Report what ran.** Runs per arm, cost, and every bar's result, including the misses. Few runs read as a direction, not a statistic: say so.

Adapted from `garrytan/gstack` `/eval-plan` (preregistration, pilot, blinding), read 2026-11-04. Run order and ledger from `sybil-solutions/inference-optimisation-skill` (MIT), read 2026-11-19.
