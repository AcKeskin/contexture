---
name: Git discipline
description: Clean commit history, one logical change per commit, no AI attribution lines
type: user
kind: architectural-rule
scope: [git, universal]
relevance: always
---

- One logical change per commit.
- Clean commit history — squash / rewrite noise before merge, not after.
- Conventional commits when applicable (type(scope): summary).
- **Never add Co-Authored-By lines or any AI attribution** to commits.
- Build commit messages with simple, literal quoting — one `-m` per paragraph. Don't construct them with shell features that interpolate or wrap text (here-strings, expanding heredocs), especially when the tool's shell differs from your interactive shell: a mismatch injects stray characters (e.g. PowerShell here-string syntax used inside a Bash tool added a literal `@`).

**Why:** commit history is a permanent interface. Each noise commit — or a corrupted message — costs every future reader.

## Branching — git-flow (strongly suggested default)

- **Long-lived branches:** `develop` (integration) and `main` (released). `main` only ever receives merges from `release/*` or `hotfix/*`, and each such merge is tagged.
- **Short-lived branches:** `feature/<slug>` (off `develop`, back into `develop`), `release/<version>` (off `develop` → `main` + `develop`), `hotfix/<version>` (off `main` → `main` + `develop`).
- **Feature work does NOT land directly on `develop`.** Branch first: `feature/<slug>`.
- **Merge `--no-ff`** into `develop` so the feature grouping survives in history. Default workflow is branch-naming + direct local `--no-ff` merges (no mandatory PR ceremony) unless a project opts into PRs.
- Releases: cut `release/*` from `develop`, stabilize, merge to `main` (tag) and back to `develop`.

**Why:** the `develop`/`main` split keeps released code isolated from in-flight work; `--no-ff` preserves the "this set of commits was one feature" boundary that a fast-forward erases.
