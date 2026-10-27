---
name: cycle
description: "Unattended dev-cycle loop: after one setup conversation it runs cycle after cycle (audit with online prior art, plan, implement, review/fix, draft PR) while the user is away, and the user can watch or jump in at any time. Use on /cycle, /cycle <run>, /cycle status, /cycle watch, /cycle stop, /cycle projects-template, or \"keep working on this project while I'm away\"."
disable-model-invocation: true
---

# cycle

The **unattended dev-cycle loop**. Every stage of a development cycle already exists as an organ: `spec`, `draft-plan`, `execute` / `orchestrate`, `review`, `close-out`, `pr-author`. `/cycle` runs them back to back, run after run, while the user is away: it finds the next work itself, does it on a branch, checks it, and leaves a draft PR and a digest. The user sets it up once, then watches or jumps in whenever they like.

It is a **driver, not a new organ.** It calls the existing organs and adds only the loop: setup, the audit, the slice pick, escalation, run state and the completion check. If it reimplements spec, execute or review logic, it is wrong.

Files next to this one:

- [cycle-contract.md](cycle-contract.md) — the contract both hosts follow: stages, run state, escalation, completion.
- `cycle-loop.mjs` — the loop: one headless Claude session per stage, the slice pick, stops, pushes and draft PRs, the digest, the status page, notifications.
- `cycle-state.mjs` — run-state file work: `init`, `setup-check`, `check`, `status`, `log`, `outcome`, `template`.
- `config-defaults.md`, `contract-defaults.md`, `projects-template.md`, `status-page.html`.

`<skill-dir>` below means the folder holding this file.

## When to run

- User types `/cycle` or one of its forms, or asks to "keep working on this project while I'm away", "run cycles on this repo".
- User-invoked only. The loop is long-running and spends real budget; it never starts on its own.

## Forms

- `/cycle` — in a repo with no `.claude/cycle/config.md`: **setup** (below). In a set-up repo: show the digest's head and offer the start command again.
- `/cycle <run>` — **jump in**: show the run's state, take the user's card answers or edits, and leave them for the loop to read at its next stage.
- `/cycle <run> --stage <N>` — **one headless stage**, started by the loop. Not typed by the user.
- `/cycle review <pr> <folder>` — **one headless PR review**, started by the loop when `merge: on`. Not typed by the user.
- `/cycle status` — `node <skill-dir>/cycle-loop.mjs status <repo>`: heartbeat, current run and stage, open cards, cost.
- `/cycle watch` — `node <skill-dir>/cycle-loop.mjs watch <repo>`: follow the current stage's live feed.
- `/cycle stop` — `node <skill-dir>/cycle-loop.mjs stop <repo>`: the loop stops after the current stage.
- `/cycle projects-template` — `node <skill-dir>/cycle-state.mjs template <run>`: project instructions carrying the contract, for a Claude Code Project.

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

## One headless stage (`/cycle <run> --stage <N>`)

The loop starts each stage as a fresh process; the loop itself runs stage 0 (`setup-check`) without a model. A stage reads everything from `.claude/cycle/<run>/`, never from memory, and **always ends by recording its outcome**:

```
node <skill-dir>/cycle-state.mjs outcome <run> <N> <done|blocked|stuck|budget|idle|error> "<note>" --root <repo>
```

Always pass `--root <repo>` (the repo the loop runs in, not the worktree or the run folder), and check the path it prints. A stage that ends without an outcome counts as an error. It also logs one line (`cycle-state.mjs log <run> "stage N ..."`).

**Gate map.** Nobody answers prompts during a stage, so the driven organs' own gates map to the run: `spec` runs delta-only with no interview (the confirmed slice settles the approach); `draft-plan`'s triviality check and review gate are accepted under the run contract (with no autonomy contract set, the implicit default applies; say so in the log); `execute`'s done-criteria confirmation moves to the end gate (the draft PR); `review`'s per-finding prompts become fix steps or cards; `close-out` runs its record step only. Any other question a stage would ask becomes a **card** with a default, or, for a `block` row in `contract.md`, an outcome of `blocked` with the reason. **Answered cards come first:** read `cards/` at the start of every stage and apply what the user wrote.

### Stage 1: audit

Read the code as it is on `origin/<base_branch>`, not the local checkout, which may sit on another branch or behind: `git fetch origin`, then a detached worktree of `origin/<base_branch>` in the run folder for the audit to read and run in. Remove it at the end of the stage with `cycle-state.mjs remove-worktree <run> <path>`, never a bare `git worktree remove`.

**Worktrees and dependencies.** Install dependencies in every worktree with setup's `install` command. Never link `node_modules` or any other folder of the main checkout into a worktree (symlink or junction): removing the worktree deletes through the link into the main checkout. `remove-worktree` unlinks such links before it removes anything, and the loop unlinks any link that points outside the run folder after every stage.

Write `audit.md` with a `## Ranked` table the loop parses:

```
## Ranked

| id | gap | kind | effort | files | taste | status |
|---|---|---|---|---|---|---|
| A1 | <one line> | Missing | S | src/a.ts, src/b.ts | no | open |
```

- **Missing:** spec done-criteria not met, docs or design-doc lines with no code, broken flows found by running `test` or the app.
- **Polish:** `review` drift, rough edges, failed captures. Take fresh captures; never judge from old screenshots in the repo. When the repo has `.claude/visual/contract.json`, run the [visual](../visual/SKILL.md) audit and list its gaps here.
- **Adapt:** prior art in this repo or one the user named, and **online**: at most 5 web searches and 3 repo or page reads, chosen from the slice candidates (one feature, one look). Each find gets a line under `## Adapt notes` with the URL, what to take (a mechanism, a layout, an interaction) and its license. Code is adapted only under a compatible license; otherwise it is an idea, never a copy. Visual finds are references, and choosing between them is a taste-call. Search terms describe the feature and domain, never private details of the repo. No relevant find: write that, with the queries.
- **Check every finding against the code before listing it.** A screenshot can be stale; a code comment can record that a "defect" is deliberate.
- `effort` is S, M or L; `files` lists what the slice would touch; rows already parked or done keep that status.
- `taste` is `no`; `visual` when the open choice is a look or a layout the repo's visual contract can settle (spacing, grouping, color within the tokens), so the critic decides it and the user rates it afterwards; or `yes` for any other choice only the user can make (game balance, scope, wording of a rule). Use `visual` only in a repo with `.claude/visual/contract.json`.

Rank by value against effort, then `outcome <run> 1 done`. The loop picks the slice (the top row within `slice_effort`, outside `never_touch`, not `taste: yes`, not `taste: visual` unless the repo has a visual contract, not parked), writes it under `## Confirmed slice` and leaves a card the user can answer to swap it. Nothing worth doing within the limits: `outcome <run> 1 idle`.

### Stage 2: plan

Read `## Confirmed slice` (and any answered slice card). Invoke [spec](../spec/SKILL.md) delta-only, then [draft-plan](../draft-plan/SKILL.md). Plan verifications use full paths, never a bare filter word that can match more than intended. `outcome <run> 2 done "<plan path>"`; an architecture fork the spec cannot settle is `blocked`.

### Stage 3: implement

`git fetch origin`, then cut a worktree from `origin/<base_branch>` (never the local checkout). Name the branch after the work, not the run: `feat/<spec-slug>` for a *Missing* or *Adapt* slice, `fix/<spec-slug>` for *Polish*, with the slug from stage 2's spec. If that name exists locally or on `origin`, add `-2`, `-3`; never reuse a branch the loop did not create. The prefixes must be listed in `run_branch_prefix`, or the loop will not push the branch. Cut it with `git worktree add --no-track -b <branch> <path> origin/<base_branch>`. Without `--no-track` the branch tracks the base, and a bare `git push` would push to it. Invoke [execute](../execute/SKILL.md) (or [orchestrate](../orchestrate/SKILL.md) when the plan decomposes). End with a **WIP commit** on the run branch, so review sees the diff. Stage files by name; never `git add -A`. When `.claude/` is ignored globally but the repo tracks spec or plan files there, add them with `git add -f`. `outcome <run> 3 done "implemented on <branch>"`.

### Stage 4: review / fix

1. [review](../review/SKILL.md) the run branch's diff against `origin/<base>`, and run `test`.
2. With a declared `capture`: before/after pairs for the screen states the change touches, from `origin/<base>` and from the WIP commit (not `git stash`, which other worktrees share). A capture that writes tracked files: copy the images out of the repo and restore the files. Compare only the regions the change touched. When the repo has a visual contract, skip this step: after this stage records `done`, **the loop** captures every state from a fresh worktree of `origin/<base>` and from the run branch, diffs each pair above the state's noise floor, and starts the visual critic as its own session for the states that changed. Do not capture for the critic and do not judge the captures yourself. Leave the run branch's worktree in place and built, since the loop captures from it; a `needs-revision` verdict brings the run back here with `visual/verdicts.json` to fix first.
3. Findings become fix steps; commit each round. Record a fingerprint per round (tree hash, first failing line, any denied action). The same fingerprint for 3 rounds, or `retry_cap` rounds, ends the stage: `outcome <run> 4 stuck "<what it tried, why it stopped>"`.
4. Fill each completion item's `evidence:` in `contract.md` as it is met: the command plus an output excerpt, or a file path.
5. On a rerun after the PR review asked for changes, read `<run>/review/review.json` and fix each finding with `blocking: true` first.

`outcome <run> 4 done`.

### Stage 5: finalize

1. [close-out](../close-out/SKILL.md), record step only (reconcile and retire wait for the merge). No changelog in the repo: a card with the line as default.
2. Stage by name and commit. Then fill `staged-by-name` and run `cycle-state.mjs check <run>`. Exit 1: go back and fill the missing evidence; never claim done while it fails.
3. Write `pr.md`: first line `# <title>`, then the [pr-author](../pr-author/SKILL.md) body with the before/after pairs, the approaches considered and rejected, and the run's open cards. No AI attribution.
4. **Do not push.** The loop pushes and opens the draft PR as `config.md` allows, after its own `.git` check. On a rerun after review changes, the push updates the open PR.
5. `outcome <run> 5 done "branch=<run branch>"`.

### Review (`/cycle review <pr> <folder>`, headless)

With `merge: on`, the loop starts this as its own session for each PR it published and for open PRs carrying `merge_label`, once per head commit. You review; the loop posts and merges.

1. Read `<folder>/pr.json`. Follow [review](../review/SKILL.md)'s `--pr` procedure for PR `<pr>`, read-only through `gh`, including its refuting verify pass. Skip its vault write and its pick prompt.
2. A finding is **blocking** when it is Critical or High and the verify pass confirmed it.
3. Write `<folder>/review.json`: `{ "verdict": "approve" | "changes", "summary": "...", "findings": [{ "severity", "file", "line", "claim", "blocking", "suggestion" }] }`. The verdict is `changes` when any finding is blocking, `approve` otherwise.
4. Write `<folder>/comment.md`, the one PR comment: first line `**Automated review (cycle)**`, then the summary and the findings with `file:line`, blocking ones first. Plain words, no other attribution.
5. Never edit, commit, push, approve, comment or merge yourself.

The loop then posts `comment.md` and merges only when every gate holds: an `approve` verdict, every check passes (it waits up to `merge_ci_wait_min`), no new commits since the review, and for its own runs the critic's approval (when `merge_needs_critic: yes` and the repo has a visual contract) and no open block card. A labeled PR also needs its label still on. Its own run with `changes` goes back to stage 4, up to `retry_cap` rounds; a labeled PR with `changes` only gets the comment.

## Jumping in (`/cycle <run>`)

The user can step in at any time without stopping anything:

- **Answer a card:** write the answer in the card file and set `status: resolved`. The next stage applies it.
- **Swap the slice:** before stage 2 starts, write another ranked id under `## Confirmed slice`.
- **Edit the plan or the audit:** the next stage reads the files as they are.
- **Stop:** `/cycle stop`. The current stage finishes, then the loop stops and says why in the digest.

When the user jumps in, show the run's stage table, its open cards and the last lines of its log, then make the edits they ask for. Never restart a stage from here; the loop owns that.

## What cycle does NOT do

- **Not a verifier.** Review, tests and the project's capture tools judge the work.
- **Not a merger by default.** It ends at a pushed branch and a draft PR, and only when setup allowed it. It merges only with `merge: on`, through the review gate, and only its own PRs and PRs you labeled. Never pushes to the base branch, never force-pushes, never bypasses the repo's rules.
- **Not a taste judge.** Choices the project's design contract does not settle become cards.
- **Not a cross-project sweeper.** The audit reads this repo, prior art the user named, and a bounded online search.
- **Not silent about failure.** A parked or stuck slice leaves a note saying what it tried and why it stopped.

## Relationship to other organs

- **spec / draft-plan / execute / orchestrate / review / close-out / pr-author** — the stages it drives, through the gate map.
- **autonomize** — the baseline posture; the run's `contract.md` rows sit on top.
- **wrap** — the same driver pattern for a session's end.
