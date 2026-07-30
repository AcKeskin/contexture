---
name: Git workflow mechanics
description: Branching model and commit-message construction mechanics for git-focused work
type: user
kind: architectural-rule
scope: [git, universal]
relevance: when-invoking-tools, during-execution
---

- <!-- id: literal-commit-messages --> Build commit messages with simple, literal quoting — one `-m` per paragraph. Don't construct them with shell features that interpolate or wrap text (here-strings, expanding heredocs), especially when the tool's shell differs from your interactive shell: a mismatch injects stray characters (e.g. PowerShell here-string syntax used inside a Bash tool added a literal `@`).

**Why:** a corrupted commit message is permanent; literal quoting removes the shell-interpolation failure mode.

## Branching — git-flow (strongly suggested default)

- <!-- id: long-lived-branches --> **Long-lived branches:** `develop` (integration) and `main` (released). `main` only ever receives merges from `release/*` or `hotfix/*`, and each such merge is tagged.
- <!-- id: short-lived-branches --> **Short-lived branches:** `feature/<slug>` (off `develop`, back into `develop`), `release/<version>` (off `develop` → `main` + `develop`), `hotfix/<version>` (off `main` → `main` + `develop`).
- <!-- id: feature-branches-off-develop --> **Feature work does NOT land directly on `develop`.** Branch first: `feature/<slug>`.
- <!-- id: merge-no-ff --> **Merge `--no-ff`** into `develop` so the feature grouping survives in history. Default workflow is branch-naming + direct local `--no-ff` merges (no mandatory PR ceremony) unless a project opts into PRs.
- <!-- id: release-workflow --> Releases: cut `release/*` from `develop`, stabilize, merge to `main` (tag) and back to `develop`.

**Why:** the `develop`/`main` split keeps released code isolated from in-flight work; `--no-ff` preserves the "this set of commits was one feature" boundary that a fast-forward erases.
