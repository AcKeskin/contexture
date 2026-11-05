# `<important if>` blocks in CLAUDE.md, 2026-11-05

## Question
Should contexture recommend wrapping task-specific CLAUDE.md sections in `<important if="...">` blocks (humanlayer/skills `improve-claude-md`)? Ship the advice only if it measurably raises adherence.

## Arms
Same project, same task, same rules. Only the CLAUDE.md shape differs.
- bare: 8 domain sections as plain markdown (`claude-md-bare-*`)
- if: the same 8 sections, each wrapped in `<important if="...">` (`claude-md-if-*`)

Two tasks, each hits one rule buried in the middle of the file:
- migration: name `NNNN_<slug>.sql` with the next number (`0004_`), and an `-- up` / `-- down` pair
- money: store the amount as integer cents, named `<name>_cents`

## Bars
| metric | pass bar | direction | if missed |
| --- | --- | --- | --- |
| graders passed, `if` arm minus `bare` arm, both tasks | +3 or more of 24 (6 runs × 2 tasks × 2 graders) | higher | don't ship the advice |
| any grader where `if` is lower than `bare` | by 2 or more of 6 | lower is a miss | don't ship |

If `bare` already passes 22/24 or more, the bench can't show a gain (ceiling). Record that and don't ship.

## Decoys
None in this round. The other 7 sections are the noise the task has to see past.

No code hint: the scaffold has no `*_cents` column and no `-- up` / `-- down` markers, so only CLAUDE.md states those rules. (The `0004_` number is still guessable from the file names; expect that grader near ceiling in both arms.)

## Stop rules
- spend cap: $10
- stop after the pilot if `bare` is at 11/12 or better (ceiling)
- stop on the first rate-limit or auth error

## Pilot
3 runs per case, `--ablation none`:

```sh
claude plugin eval . --tag important-if --runs 3 --ablation none --trust-plugin --no-publish --scaffold --max-cost-usd 4
```

Full run: `--runs 6`. Project cost from the pilot before running it.

## Result
Not run yet. Headless runs were not allowed in the cloud session that wrote this; run it locally.
