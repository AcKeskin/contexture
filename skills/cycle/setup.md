# cycle: setup

Read when the step that points here runs.

## Setup (the one conversation that needs the user)

1. **Work in the target repo.** The session's folder is the repo's root or a worktree of it. If not, stop and say so: a loop that edits another repo hits write guards.
2. **Ignore the run folder.** Check `git check-ignore -q .claude/cycle`; if it is not ignored, propose the ignore line (accept/edit/reject), never add it silently.
3. **Declare and check the setup.** `node <skill-dir>/cycle-state.mjs init setup` (a scratch run), then fill its `setup.md` from what the repo states (CLAUDE.md, README, package scripts, CI config, test runners):
   - `paths`: engine or build binaries, capture tools.
   - `commands`: `test`, `smoke` (one cheap command that proves the toolchain runs, e.g. one e2e spec), `capture` for UI work. No env prefixes; variables go under `env:`.
   - The screen **states** that matter for UI work (e.g. affordable / locked / maxed), not only the screens.
   - `write_scope`: `base_branch`; `run_branch: after-slice`.
   Run `setup-check setup` and ask every gap in **one** message; repeat until it exits 0. It records the baseline from `smoke`; a red baseline is a gap now, not at 3 a.m. Then copy that `setup.md` to `.claude/cycle/setup.md`, the template every run starts from.
4. **Write the loop config.** Copy `config-defaults.md` to `.claude/cycle/config.md` and ask, in one message: the limits (`max_runs`, `max_hours`, `total_budget_usd`, and the plan-usage caps `max_usage_5h` / `max_usage_7d`), `never_touch` globs, `github` (`none` / `push` / `push+draft-pr`, the user's explicit choice), `models` (the audit's model, and the work stages' model or `auto` by slice effort), and notifications (channels: `toast`, `ntfy:<topic URL>`, `webhook:<URL>`, or `none`; events: `parked`, `pr`, `stopped`, `card`, `run-done`). Offer the defaults; write only what the user confirms.
5. **Check the headless CLI.** The loop runs `claude -p`, which has its own login, separate from an app or IDE session. Run `claude -p "reply ok" --output-format json --max-budget-usd 0.5` once (loading the user config alone costs about $0.2, so a smaller cap fails with `error_max_budget_usd`). Only an auth error fails the check: it means the user runs `claude` and logs in before the loop can start.
6. **Hand over the start command.** The loop is the user's process on the user's machine. Print it for their shell (on Windows PowerShell, no `&&`):
   ```
   node "<skill-dir>/cycle-loop.mjs" run "<repo>"
   ```
   Then say how to watch: `http://127.0.0.1:<port>`, `/cycle watch`, `/cycle status`; and how to stop: `/cycle stop`. Remind the user the machine must stay awake.
