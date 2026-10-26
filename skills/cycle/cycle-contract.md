# Cycle contract — reference

The contract an unattended dev-cycle loop follows: from finding the next work to a draft pull request, run after run, while the user is away. It is host-agnostic. The local `/cycle` skill and its loop script run it, and a Claude Code Project can run it from its project instructions. Both read the same stages, escalation rules and run state.

## What this owns

- The setup, and the six stages of a run.
- The run-state files and the loop state.
- Escalation: which decisions park a slice, and which become decision cards.
- Completion: what must have evidence before a run is published.
- Stop conditions, watching, and how each host maps onto the contract.

## What this does not own

- **Requirements, plans, execution, review** — `spec`, `draft-plan`, `execute` / `orchestrate`, `review`. The cycle sequences them.
- **Interrupt posture** — the autonomy contract (`autonomize`); a run's escalation table sits on top of it.
- **Closing a slug** — `close-out`. **PR text** — `pr-author`.
- **Visual judgment** — the project's capture tools take the pictures; the cycle does not grade taste.

## Setup

The one conversation that needs the user, before the loop starts:

- The session works in the target repo (its root or a worktree), so write guards don't stop the loop midway.
- Every declared path exists, every declared command resolves on PATH, and a `smoke` command passes. Its result is the **baseline**; a red baseline is fixed now.
- Write scope: a base branch, and run branches named after their slice. The loop never pushes to the base.
- The loop config: limits, `never_touch` globs, the `github` choice (`none`, `push`, `push+draft-pr`), notification channels and events.

## Stages

| # | Stage | Run by | Writes | Ends with |
|---|---|---|---|---|
| 0 | Setup check | the loop script | `setup.md` baseline, block cards for gaps | green, or the loop stops for the user |
| 1 | Audit | a headless session | `audit.md` with a `## Ranked` table, Adapt notes | outcome; the script then picks the slice |
| 2 | Plan | a headless session | a delta spec and a plan | outcome |
| 3 | Implement | a headless session | a WIP commit on the run branch, in a worktree from `origin/<base>` | outcome |
| 4 | Review / fix | a headless session | fix commits, before/after captures, evidence | outcome (`stuck` after 3 same-fingerprint rounds) |
| 4v | Visual critic (repos with a visual contract) | the script, then a separate headless session | the script builds the brief from files; the critic writes verdicts; the script records them and moves baselines | approved, or back to stage 4 for a revision |
| 5 | Finalize | a headless session, then the script | `pr.md`, a passing `check`; the script pushes and opens the draft PR | the run is published or kept local |

**Audit.** Gaps go under *Missing*, *Polish* and *Adapt*, each with evidence and an effort size. Adapt includes a bounded online search (5 searches, 3 reads) for prior art and visual inspiration, each find with its URL, what to take and its license. Every finding is checked against the code before it is listed: screenshots go stale, and code comments can mark a choice as deliberate.

**Slice pick.** The script, not the model: the top ranked row whose effort is allowed, that touches no `never_touch` glob, is not a taste-call (`taste: yes`) and is not parked. A `taste: visual` row, a look or layout choice, is pickable only in a repo with a visual contract: there the critic makes the call within the contract and the user rates it afterwards. The pick is a card the user can answer to swap it.

**Review / fix.** Before/after captures come from `origin/<base>` and the WIP commit, never from a shared stash. Captures that write tracked files are copied out and the files restored. Compare only the regions the change touched.

**Finalize.** Stage by name, never everything: engines and importers rewrite tracked files. `check` passes, then the script pushes with an explicit refspec (no upstream write, so the `.git` tamper check stays meaningful) and opens a draft PR if the config allows it.

**Review and merge** (`merge: on` only). A fresh headless session reviews each PR the loop published, and between runs one open PR carrying `merge_label`, once per head commit. It writes a verdict and one comment; the script posts the comment. The script merges with `merge_method` only when the review approves, every check passes, nothing was pushed since the review, and, for its own runs, the critic approved (when `merge_needs_critic` and a visual contract) and no block card is open. A labeled PR also needs the label at merge time. Changes requested on its own run send it back to review / fix; on a labeled PR they stay a comment. The script never bypasses the repo's branch rules.

## Sessions

Each stage is a fresh headless process that reads its input from the run folder and records one outcome: `done`, `blocked`, `stuck`, `budget`, `idle` or `error`. The model writes only that outcome, to `<run>/outcome-<N>.json`; the script alone writes the loop state (`loop.json`): counters, budgets, the pick, the heartbeat. One writer per file, so a heartbeat cannot erase an outcome.

## Run state

`<repo>/.claude/cycle/`, gitignored.

| File | Holds |
|---|---|
| `config.md` | the loop's limits and permissions, re-read every stage |
| `setup.md` | the setup template every run starts from |
| `loop.json` | script-owned: session start, costs, runs, stage outcomes, parked slices, heartbeat, the stop reason |
| `digest.md` | regenerated every stage: state, "look at this first", per-run results |
| `STOP` | when present, the loop stops after the current stage |
| `<run>/setup.md` | the run's checked setup and baseline |
| `<run>/audit.md` | the ranked table, Adapt notes, the confirmed slice |
| `<run>/contract.md` | escalation rows, `retry_cap`, completion items with `evidence:` |
| `<run>/log.md` | one line per stage, escalation and card |
| `<run>/stage-<N>.log` | the stage's live feed |
| `<run>/outcome-<N>.json` | the stage's recorded outcome; the loop copies it into `loop.json` |
| `<run>/cards/` | decision cards: `kind: block` or `card`, `status: open` or `resolved` |
| `<run>/pr.md` | the PR title and body |

## Escalation

Each trigger is **block** (park the slice with a note and move to the next one; setup gaps are asked during setup) or **card** (record the decision with a default and keep going on work that does not depend on it). Defaults, copied into each run's `contract.md`:

| Trigger | Default |
|---|---|
| Setup gap (tool, path, write scope) | block |
| Irreversible or outward action beyond the config (publish, delete, migrate data) | block |
| Architecture fork the spec does not settle | block |
| Retry cap hit, or the same failure fingerprint 3 times | block |
| Spec ambiguity with more than one reading | card |
| Scope growth beyond the confirmed slice | card |
| Taste-call the project's design contract does not settle | card |
| Low confidence the change meets the completion items | card |

The user can answer a card, edit the run folder, or stop the loop at any time; the next stage reads what they wrote.

## Completion

A run is published only when every completion item in `contract.md` has evidence (a command and an output excerpt, or a file path). `cycle-state check` exits 1 while any is empty, and the script runs it again before pushing: a stage's own "done" is not enough.

## Stop conditions

Checked before every stage: the `STOP` file; the session budget; the 7-day plan-usage cap; the hours limit; the run count; two runs in a row that changed no files; two stage errors in a row; an audit with nothing the loop may take; a changed `.git/config` or `.git/hooks`. A usage-limit result, or 5-hour plan usage at its cap, waits for the reset instead of counting as an error. Each stop writes its reason to the digest and raises a `stopped` notification.

## Watching

Read-only, from outside the loop: `/cycle status`, the live stage feed (`/cycle watch`), a status page on `127.0.0.1` that refreshes on its own, and notifications for the chosen events on the chosen channels (`toast`, `ntfy`, `webhook`). A notification carries the event, run, slice and digest path, never code.

## Hosts

| | Local `/cycle` | Claude Code Project |
|---|---|---|
| Where | CLI, IDE plugins, desktop | claude.ai/code, desktop, mobile (Pro/Max, beta) |
| Driver | `cycle-loop.mjs` | the project coordinator, following the project instructions |
| A stage | a headless `claude -p` process | a thread |
| Run state | `.claude/cycle/` | project memory |
| Organs | installed by bootstrap | not available in cloud threads today; the rules are instructions only |
| Push / PR | the loop script, after the `.git` check | the finalize thread, as the instructions allow |
| Watching | status page, feed, notifications | Overview and app notifications |

`/cycle projects-template` prints project instructions that carry this contract for the Project host.
