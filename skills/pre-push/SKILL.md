---
name: pre-push
description: Pre-flight checklist before a git push — commits-to-ship summary + branch-name / commit-hygiene / AI-attribution / staged-leftover / debug-artifact / hook-bypass / unresolved-secret checks; stops on any flag, never pushes past it. Auto-fires when about to run git push or on "push this" / "send it up". Skip on the scratch branch or "skip pre-push". /pre-push.
---

# pre-push

Reviewee-side pre-flight before a `git push`. The first of the GitHub reviewee triad; siblings are [pr-author](../pr-author/SKILL.md) and [pr-triage](../pr-triage/SKILL.md). The reviewer-side counterpart is [pr-review (030)](../pr-review/SKILL.md).

Whatever the local branch is, that's what ships to the remote. Most pre-push issues are catchable in seconds; none are caught when the push is improvised inline. This skill runs the checklist once, surfaces flags, and stops on a flag — it does not push past a problem on its own.

**Triad-wide boundary — no Claude-initiated GitHub writes.** Across all three skills, Claude **never runs a `gh` command (or any API call) that writes to GitHub** — no `gh pr create`, no `gh pr comment`, no thread reply, no `gh api POST`. Those are drafted and handed to the user to run. Claude *does* apply **local** changes (working-tree code edits, staging) and runs **read-only** `gh` calls (`gh pr view`, `gh api GET`). `git push` is the one remote-touching action Claude runs — and only the exact push the user asked for, only after the checklist passes — because it ships the user's own commits via git, not via GitHub's API on the user's behalf. The rule: Claude prepares; the user is the one who *speaks to GitHub*.

Auto-fires **via this description**, not a hook (per [skill-auto-fire (architectural rule)](../../architectural-rules/universal/skill-auto-fire.md)). The right moment is "about to push" — a concept that only exists once a push is imminent, so a SessionStart hook would fire against nothing.

## When to run

Auto-fire when:
- About to run a Bash command matching `git push` (any form — `git push`, `git push -u origin <b>`, `git push origin HEAD`, etc.).
- The user says "push this", "push the branch", "send it up", or equivalent.

Skip when:
- The push target is the user's configured scratch branch (see [Configuration](#configuration)). Scratch pushes are intentionally low-ceremony.
- The user explicitly says "skip pre-push", "force push, I know", or similar. Back off; run the push the user asked for.
- This is a re-push in the same session and nothing has changed since the last passing run (don't re-run the full checklist on every push of an unchanged branch — say so and proceed).

Manual trigger: `/pre-push`.

## Procedure

### 1. Surface what's about to be pushed

Determine the upstream:

```
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

- **Has upstream** → list the commits being sent and the size:
 ```
 git log @{u}..HEAD --oneline
 git diff --stat @{u}..HEAD
 ```
- **No upstream yet** (first push) → surface that explicitly. First push is a different animal: it sets tracking and creates the remote ref. List the commits relative to the base branch instead:
 ```
 git log <base>..HEAD --oneline
 git diff --stat <base>..HEAD
 ```
 Resolve `<base>` per [pr-author's base detection](../pr-author/SKILL.md#1-resolve-pr-context) (`git symbolic-ref refs/remotes/origin/HEAD`, fall back to main/master/trunk).

Show the user a one-block summary: branch, upstream (or "first push — no upstream"), N commits, +A/-D lines.

### 2. Pre-flight checklist

Run the seven checks. Each is **tick** (pass, silent) or **flag** (surface). Optionally load project rules first via [discover (002)](../discover/SKILL.md) (`kind: "architectural-rule"`, scopes `[git, <detected-language>, global]`) to pick up project branch-name / commit conventions; fall back to the built-in smells when no project rule exists.

1. **Branch name follows convention.** Per project standards if discovery surfaced any; else flag obvious smells: spaces, leading slash, bare `wip` / `test` / `asdf` / `tmp`, uppercase-only, or a name identical to the default branch.
2. **Commits clean.** No `fixup!` / `squash!` / `wip` prefixes still in `git log @{u}..HEAD` (or `<base>..HEAD` on first push). These belong squashed before push, not after.
3. **No AI-attribution lines.** Scan the commit messages in range for `Co-Authored-By:`, `Generated with`, `🤖`, or any AI-attribution footer. Flag any hit — per [git.md](../../architectural-rules/universal/git.md), commit history never carries AI attribution.
4. **No staged-but-uncommitted leftovers.** `git diff --cached --stat` non-empty means staged changes that won't be in the push but linger in the index. A dirty *working tree* is fine (unstaged work in progress); *staged* leftovers are usually an accident — flag them.
5. **No debug artifacts in the diff.** Scan `git diff @{u}..HEAD` (or `<base>..HEAD`) for printf-debugging and hardcoded test scaffolding: `console.log(` / `print(` / `println!` / `dbg!(` / `debugger` in non-test files, hardcoded `localhost` / `127.0.0.1` URLs, hardcoded test credentials or tokens. Report file:line for each hit. (Self-evident; don't flag legitimate logging frameworks or test files.)
6. **Hooks not bypassed.** `git reflog -n 20` plus a scan of recent commit metadata for traces of `--no-verify`. If the last commits were made with hooks bypassed, surface it — the user may have meant to, but it's worth confirming before the work ships. Respect an active `allow-skip-hooks` arming: if hooks were *deliberately* skipped under that skill, note it as intentional, not a flag.
7. **Secret-hook carry-forward.** If the session's security hooks flagged a secret in a recent Write that wasn't resolved, that flag is a **stop condition** here — a secret must not reach the remote. Surface it as a hard flag.

### 3. Decide

- **All checks pass** → confirm with one line and proceed:
 > All checks pass. Push to `origin/<branch>`?
- **Any check flagged** → surface every flag with file:line where applicable, propose the fix for each, and **wait**. Do not push past a flag without explicit user say-so. The user can:
 - Fix the flagged item (skill helps), then re-run from step 2.
 - Override a specific flag ("that localhost URL is intentional, push anyway") — proceed, noting the override.
 - Cancel the push.

### 4. Push

- Run the actual `git push` command the user intended (preserve their flags — if they said `git push -u origin feature`, run that exact form).
- Capture output. On non-zero exit, surface the error verbatim and stop. **Do not retry silently** and do not add flags (no auto `--force`, no auto `--no-verify`).
- On success, surface the result. If this was a first push to a non-default branch with no open PR, hand off to [pr-author](../pr-author/SKILL.md) — its auto-fire moment ("post-push, no PR") has just occurred.

## Configuration

Per-repo scratch-branch exemption lives in the project's `.claude/` config when present. Absent config, treat no branch as exempt — run the checklist on every push. The user can always say "skip pre-push" inline for a one-off.

## What pre-push does NOT do

- **Does not force-push.** It never constructs a `--force` / `--force-with-lease` flag itself. The user runs force-push manually if they mean to.
- **Does not bypass hooks.** It never adds `--no-verify`. It *reads* reflog for diagnostic traces of prior bypass, but respects `allow-skip-hooks` arming and never interferes with it.
- **Does not run the full review.** Pre-push is a fast hygiene pass, not [review (005)](../review/SKILL.md). A diff-level audit is a separate, heavier skill; running it here would make every push slow. (v2 may add an opt-in `--full` that chains a fast review.)
- **Does not commit.** It surfaces staged leftovers and dirty trees; it doesn't decide commit granularity for the user.
- **Does not push past a flag silently.** Every flag stops the flow until the user resolves or overrides it.

## Relationship to other organs

- **[pr-author (041)](../pr-author/SKILL.md)** — fires right after a first push to a non-default branch with no PR. pre-push hands off to it.
- **[git.md (006)](../../architectural-rules/universal/git.md)** — the source for commit hygiene + AI-attribution checks (checks 2, 3).
- **[discover (002)](../discover/SKILL.md)** — optional rule retrieval for project-specific branch-name / commit conventions (check 1).
- **security hooks (008)** — their unresolved secret flags become pre-push stop conditions (check 7).
- **`allow-skip-hooks`** — pre-push respects its arming; intentional hook-skips under it are not flagged (check 6).
