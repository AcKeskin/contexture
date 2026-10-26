---
max_runs: 5
max_hours: 20
stage_budget_usd: 5
total_budget_usd: 40
max_usage_5h: 70
max_usage_7d: 50
max_open_prs: 3
slice_effort: S,M
never_touch:
github: none
base_branch: main
run_branch_prefix: feat/, fix/
merge: off
merge_label: cycle-merge
merge_method: squash
merge_needs_critic: yes
merge_ci_wait_min: 30
port: 7777
models:
  audit: opus
  work: auto
  S: sonnet
  M: sonnet
  L: opus
  critic: opus
  review: opus
notify:
  channels: toast
  events: parked, pr, stopped
---
# Loop config

The loop re-reads this file before every stage, so changes take effect at the next stage.

- `max_runs`, `max_hours`, `total_budget_usd`: the loop stops at the first one reached. They count from the loop's start.
- `stage_budget_usd`: passed to each headless stage as `--max-budget-usd`.
- `max_usage_5h`, `max_usage_7d`: caps on plan usage in percent, read from each stage's rate-limit report. At the 5-hour cap the loop waits for the window to reset; at the 7-day cap it stops. `0` turns a cap off. Checked before each stage, so one stage can run past a cap.
- `max_open_prs`: at this many open run PRs, a finished run is pushed but its draft PR waits.
- `slice_effort`: the effort sizes the loop may pick on its own (S, M, L).
- `never_touch`: comma-separated globs the loop may not change, for example `.github/**, release/**`.
- `github`: `none` (branches stay local), `push` (push run branches), or `push+draft-pr` (also open draft PRs). Never the base branch, never force.
- `merge`: `off` (default; merging stays yours) or `on`. With `on` and `push+draft-pr`, a fresh session reviews each PR the loop opened and each open PR you label `merge_label`, the loop posts the review as one comment, and merges with `merge_method` (`squash`, `merge` or `rebase`) when the review approves, every check passes within `merge_ci_wait_min` minutes, nothing was pushed since the review, and, for its own PRs, the critic approved (when `merge_needs_critic: yes` and a visual contract exists) and no block card is open. It never bypasses the repo's branch rules.
- `run_branch_prefix`: comma-separated prefixes a run branch may start with; the loop pushes nothing else. Stage 3 names a branch `feat/<spec-slug>` for a Missing or Adapt slice and `fix/<spec-slug>` for Polish.
- `port`: the status page, on 127.0.0.1 only. `0` turns it off.
- `models.audit`: the model for stage 1, which decides what to work on. `models.work`: the model for stages 2-5, or `auto` to pick by the confirmed slice's effort through `models.S` / `models.M` / `models.L`. `models.critic`: the model for the visual critic, which runs as its own session after stage 4 in repos with a visual contract. `models.review`: the model for the PR review when `merge: on`. Any `claude --model` value; empty means the CLI default.
- `notify.channels`: any of `toast`, `ntfy:<topic URL>`, `webhook:<URL>`, or `none`.
- `notify.events`: any of `parked`, `pr`, `stopped`, `card`, `run-done`, `merged`.
