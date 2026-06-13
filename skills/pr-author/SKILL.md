---
name: pr-author
description: Draft a pull request title and body to a clean contract — Summary + Test plan + Closes-line on top of any existing PR template — when about to open a PR. Auto-fire when about to run `gh pr create` (any form), just after a first push to a non-default branch with no open PR, or when the user says "open a PR" / "create the pull request" / "let's PR this". Drafts and hands the user a ready-to-run `gh pr create` command; NEVER runs the gh write itself. Skip when the user says "draft only" (still drafts) or on the default branch. Manual trigger via /pr-author.
---

# pr-author

Reviewee-side PR drafting. The second of the GitHub reviewee triad; siblings are [pre-push](../pre-push/SKILL.md) and [pr-respond](../pr-respond/SKILL.md).

PR title and body get composed in-place each time with varying quality — title length, summary structure, test plan, base branch all improvised. This skill drafts them to a contract, shows you the draft, and hands you a ready-to-run command. **It does not open the PR itself.**

**No Claude-initiated GitHub writes** (triad-wide boundary — see [pre-push](../pre-push/SKILL.md)). This skill drafts the PR and produces the exact `gh pr create` command for the user to run. Claude never executes `gh pr create`. Read-only `gh` / `git` calls (resolving base, listing commits) run freely.

Auto-fires **via this description**, not a hook (per [skill-auto-fire](../../architectural-rules/universal/skill-auto-fire.md)).

## When to run

Auto-fire when:
- About to run `gh pr create` (any form) — intercept and draft first.
- Just after a successful first push (`git push -u origin <branch>`) to a non-default branch that has no open PR (the [pre-push](../pre-push/SKILL.md) handoff moment).
- The user says "open a PR", "create the pull request", "let's PR this", or equivalent.

Skip when:
- The user says "draft only, don't post" — still draft the title/body and surface it, but don't produce the run-it prompt; just hand over the text.
- The current branch is the default branch (nothing to PR from).

Manual trigger: `/pr-author`.

## Procedure

### 1. Resolve PR context

All read-only:

- **Branch** — `git rev-parse --abbrev-ref HEAD`.
- **Base branch** — `git symbolic-ref refs/remotes/origin/HEAD` (strip `refs/remotes/origin/`); fall back to `main` → `master` → `trunk` by checking which exists on the remote.
- **Fork case** — `gh repo view --json parent`. If the repo has a parent (the user is contributing via a fork), the base is `upstream`'s default branch, not `origin`'s. Adjust and note it in the draft.
- **Commits in range** — `git log <base>..HEAD --oneline`.
- **Diff stats** — `git diff --stat <base>..HEAD`.
- **Linked issues** — scan commit messages in range for `#NNN` references.

### 2. Draft the PR

**Title:**
- One line, **≤70 chars** (hard cap — `gh` truncates the title bar otherwise).
- Lowercase verb start (per [git.md](../../architectural-rules/universal/git.md) commit-format convention), no trailing period, no ticket prefix unless project convention requires it.
- Describes the **change**, not the branch — don't restate the branch name verbatim.

**Body** — per the contract below, layered on any existing template:
- Detect a PR template in order: `.github/PULL_REQUEST_TEMPLATE.md` → `.github/pull_request_template.md` → `docs/PULL_REQUEST_TEMPLATE.md`. If one exists, its content is the **baseline**; fill the skill's sections on top of it rather than replacing it. (Multiple templates under `.github/PULL_REQUEST_TEMPLATE/` → v2; for v1, surface that they exist and let the user pick one to paste.)
- **## Summary** — 1–3 bullets: what changed and why. Not a commit-log copy; synthesise.
- **## Test plan** — a checklist of how the change was verified or how a reviewer can verify it.
- **Closes line** — `Closes #NNN` when a commit referenced an issue and it's the issue this PR resolves. Only when confident; otherwise omit.
- **No AI-attribution footer.**

### 3. Surface the draft + hand over the command

Show the user:
- The drafted **title** and **body** (body in a copy-ready fenced block).
- The resolved **base branch** (and a note if it's a fork's upstream).
- The **exact command** they can run, body written to a temp file to avoid shell-escaping issues:

````
Ready to open. Run this yourself when you're happy with the draft:

```
gh pr create \
 --base <base> \
 --head <branch> \
 --title "<title>" \
 --body-file <path-to-tmp-body-file>
```

(Add `--draft` for a draft PR. I've written the body to <path> so quotes/markdown survive.)
````

Then ask: **"Want me to revise the draft? (edit title / edit body / fork-base looks wrong / looks good)"** — all options edit the *draft*, none of them post. "Looks good" ends the skill with the command in the user's hands.

The skill **never runs `gh pr create`**. It writes the body to a temp file and constructs the command; running it is the user's action. If the user explicitly says "go ahead and run it" — still hand it over and confirm they want Claude to be the one to execute; per the triad boundary, the default is that the user runs GitHub writes. (Honour an explicit, unambiguous "you run it" instruction, but never default to it.)

## What pr-author does NOT do

- **Does not run `gh pr create`.** Drafts and hands over the command. The user opens the PR.
- **Does not post anything to GitHub.** No comments, no labels, no reviewers assigned — title/body draft only.
- **Does not auto-merge or set auto-merge.** Out of scope; that's a GitHub setting and a user decision.
- **Does not replace the PR template.** Layers on top of an existing one; never discards it.
- **Does not guess `Closes #NNN`.** Only emits it when a commit clearly references the resolving issue.

## Relationship to other organs

- **[pre-push (041)](../pre-push/SKILL.md)** — hands off to pr-author after a first push with no PR.
- **[pr-respond (041)](../pr-respond/SKILL.md)** — the third triad skill; fires later, when review comments arrive on the opened PR.
- **[git.md (006)](../../architectural-rules/universal/git.md)** — title format (lowercase verb start, no AI attribution).
- **[discover (002)](../discover/SKILL.md)** — optional, for project-specific PR conventions.
