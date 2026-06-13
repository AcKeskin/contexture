# Out-of-scope findings

When the user dismisses a review finding with a load-bearing reason — not "skip it" but "we're not doing that, and here's why" — record the dismissal so the next `/review` run recognizes it instead of re-surfacing the same drift.

## What gets recorded

A dismissal qualifies as out-of-scope when **all** of the following hold:

- The user gave a reason, not just "skip."
- The reason is durable — it would still apply to a future explorer (architectural decision, business constraint, deliberate exception). Skip ephemeral reasons ("not now", "later", "it's fine for this PR").
- The finding is specific enough that a future run could match against it (a file path, a pattern, a concept name).

If the reason is durable and structural enough that an ADR makes more sense, surface that instead — offer to record it under `docs/adr/` and skip the out-of-scope file.

## Where it lives

Per project: `<project-root>/.claude/review-out-of-scope/<slug>.md`

Slug derives from the finding's most distinctive feature — file path, pattern name, or concept. One file per dismissal. Lazy-create the directory; do not pre-create.

## File format

```markdown
---
date: YYYY-MM-DD
finding-category: dead-code | monolithic-files | soc | missing-pattern | principle | comment-drift
scope: <file path or pattern>
---

## What review flagged

<one-paragraph summary of the finding the run produced>

## Why it stays

<the user's load-bearing reason — quote where helpful>

## How to recognize a recurrence

<concrete signal: file path, identifier name, structural shape — what a future run should match against>
```

## How review uses it

At the start of step 3 (file scan), after rules load:

1. Read every file under `.claude/review-out-of-scope/`. Skip silently if the directory does not exist.
2. Index by `scope` and `finding-category`.
3. While collecting findings, check each candidate against the index. A match means: drop the finding silently and add it to a "suppressed" count reported at the end of the run.

Do not re-prompt the user about suppressed findings. The whole point is they already decided.

## When to revisit

If the user asks "what got suppressed?" — list them with their reasons. If the user explicitly wants to re-evaluate one ("does the reason for `<slug>` still hold?"), read the file, summarize, ask whether to keep, edit, or delete. Edits and deletes go through propose-confirm-commit.
