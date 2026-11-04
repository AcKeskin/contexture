# extract-conventions: reference

Read when the step you are on points here, or when something fails.

## What extract-conventions does NOT do

- **Does not auto-fire.** Mode A only. No hook, no session/task trigger.
- **Does not generate formatter/linter config.** No `.editorconfig` / ESLint / clang-format. It writes human-and-model-readable conventions prose for judgment-based review, not mechanical enforcement.
- **Does not claim exhaustiveness.** Reports dominant, confidently-observed conventions with confidence levels — not every micro-pattern. Honesty over coverage.
- **Does not present inference as fact.** Semantic conventions are flagged lower-confidence; an absent pattern is never asserted.
- **Does not auto-write.** Per-category propose-confirm-commit gate; nothing lands until accepted.
- **Does not silently override a shipped rule.** Conflicts are surfaced at confirm; the override carries a `contradicts` note.
- **Does not re-detect inside the language-pro agent.** The agent writes prose from the settled convention list; detection is the skill's job.
- **Does not implement the conform mechanism.** Conform = the rule-prime hook (prime) + `/review` (audit) reading this file.
- **Does not detect drift between the file and evolving code.** v1: re-run to refresh.

## Relationship to other organs

- **rule-prime hook** — the consumer that makes this output load-bearing. **Hard dependency** for payoff: the hook primes the extracted file into context. Without it the file is inert (the exact disease the hook fixes).
- **naming-and-comments** — the auditor. The extracted conventions are the project-tier rules its audit cites; conformance precedence is project convention > file-local style > universal default.
- **rule overlay / rules skill** — the tier this writes to and resolves against. `/rules where <key>` shows the written file winning over the shipped default.
- **language-pro agents** — own idiomatic prose authoring (§6). Dispatched with positive scope + hard placement, no further spawn.
- **codemap** — adjacent extractor (structure vs conventions). `detect.mjs` is independent of codemap's AST machinery in v1; a future version may consume the codemap's tree-sitter output for structural conventions.
- **new-agents-md** — downstream beneficiary: real extracted conventions materially improve its `## Conventions` section.

## Debug

- **"no dominant convention" for an axis you expected** — the sample didn't reach the ≥60% plurality threshold, or the scope genuinely mixes styles. Widen the scope or check the sample with the evidence files listed.
- **Language-pro dispatch returned non-rule-shaped prose** — the skill re-authors in-house rather than writing malformed output. Flag via `/capture` if a specific language-pro keeps doing this.
- **Written file doesn't prime** — confirm the `rulePrime` hook bundle is enabled (`bootstrap --verify`) and the frontmatter `relevance: when-touching-<lang>` matches the language you're touching. The file is inert without the hook.
- **Conflict not flagged** — the §5 overlay check only catches contradictions with *shipped* rules it can resolve; a convention contradicting a *user-tier* rule is the user's own overlay to reconcile.
