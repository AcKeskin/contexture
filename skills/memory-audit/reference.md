# memory-audit: reference

Read when the step you are on points here, or when something fails.

## What memory-audit does NOT do

- **Does not auto-fire.** Mode A only.
- **Does not judge decision *validity*.** memory-audit owns **mechanical integrity** — is the `superseded_by` back-link present, is the relation target real, is the schema valid. It does **not** ask "*should* this decision be superseded — is it still true?" That validity judgment belongs to the corpus checkpoint (`/checkpoint --scope corpus`); it makes the call, then routes the resulting mechanical fix back here.
- **Never auto-fixes, bulk-applies, or deletes silently** — every finding is its own propose-confirm decision, per §5.
- **Does not back up before changes.** The user's git commit habits are the rollback mechanism for memory tree files; if the memory tree is not git-tracked (the default — never edit `.gitignore` to force-track it; surface the situation and let the user decide), the user's chosen sync layer (or lack thereof) is the rollback.
- **Does not use embeddings.** Duplicate detection is text-overlap on the first paragraph. For ~50 memory files, regex + tokenization is sufficient. Vector search is overkill for our scale (deliberately not adopted).
- **Does not span multiple projects per invocation.** `--project <slug>` switches to a different project; it does not audit all projects in one pass. Cross-project audits would need a separate invocation per project.
- **Does not modify files outside the memory tree.** No edits to skills, codemap, or commands. Audit is scoped to memory.
- **Does not check audit findings against past audits** (no state). Each run is fresh. If a finding was deferred last run and the user wants it suppressed permanently, the user removes it manually or via a `--ignore` flag in v2 (not in v1 scope).

## Failure modes

- **Memory tree missing entirely** — report "no memory tree found at <path>" and stop. Don't create one.
- **MEMORY.md missing** — flag as the first finding ("MEMORY.md is missing — index cannot be checked"), continue with the file inventory's other dimensions.
- **The user has another session writing to MEMORY.md mid-audit** — re-read MEMORY.md before each MEMORY.md-related fix to avoid clobbering. If the file changed mid-audit, re-run the affected findings.

## Limits (v1)

- Adding an eleventh dimension is a v2 conversation; surface the case to `/capture` before extending.
- Heuristics (duplicate threshold at 80%, dimension ordering, severity ranking) are deliberately simple. Tune in v2 with usage data, not speculatively.
- No persistent state between runs. If the user wants "remember I dismissed this finding," that's a v2 feature (similar to review's out-of-scope index).
