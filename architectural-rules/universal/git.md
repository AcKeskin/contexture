---
name: Git discipline
description: Clean commit history, one logical change per commit, no AI attribution lines
type: user
kind: architectural-rule
scope: [git, universal]
relevance: always
floor-priority: high
---

- <!-- id: one-change-per-commit --> One logical change per commit; squash noise before merge, not after.
- <!-- id: conventional-commits --> Conventional commits when applicable (type(scope): summary).
- <!-- id: no-ai-attribution --> **Never add Co-Authored-By lines or any AI attribution** to commits.

**Why:** commit history is a permanent interface — noise costs every future reader.

Branching model and command mechanics: see universal/git-workflow.
