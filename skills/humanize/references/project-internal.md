# Register module — project / internal docs

PR descriptions, proposals, issue bodies, RFCs. Imports the catalogue (`ai-vocabulary.v1.md`) + carve-out (`false-positives.md`). Short PR descriptions may fall below the length floor — score conservatively.

## Register-specific tells (flag by density)

- **Narrated-journey PR bodies** — "First, I refactored… Then I carefully… Finally, I ensured…". A PR body states what changed and why, not the diary.
- **Significance puffery on a change** — "This pivotal change fundamentally transforms…". Most PRs are incremental; say what moved.
- **Formulaic Summary/Changes/Testing scaffolding filled with hollow phrasing** — the *sections* are fine (see preserve-list); the AI-vocabulary stuffing inside them is the tell.
- **"This PR not only fixes X but also improves Y"** negative-parallelism upgrades.
- **Sycophantic issue framing** — "Great catch! This is a fantastic opportunity to…".

## Conventions to PRESERVE (never flag — native here)

- Summary / Test plan / Changes / Closes-#NNN structure — these are PR-hygiene conventions (matches `pr-author`).
- Bulleted change lists, checkboxes, linked issues, file/line references.
- Imperative commit-style phrasing ("Add", "Fix", "Refactor").
- Terse, mechanical descriptions — internal docs reward density over flourish.
- Em-dashes, parentheticals, code references.
