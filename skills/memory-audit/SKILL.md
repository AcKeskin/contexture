---
name: memory-audit
description: Audit the project's memory tree for integrity drift + bloat — orphans, duplicates, broken relations, stale references, schema gaps, staleness/value, uncompressed bodies. Ten dimensions, propose-confirm-commit per finding, read-only by default. Use when the user types /memory-audit. Mode A only — never auto-fires.
---

# memory-audit

Sibling of [review (005)](../review/SKILL.md) — same propose-confirm-commit shape, same flow, but scoped to the memory tree (`~/.claude/projects/<slug>/memory/`) instead of code. Implements. Depends on for the typed-relations check; legacy memories without `relations:` are tolerated as a no-op for that dimension.

## When to run

- User types `/memory-audit` (explicit trigger).
- User says "check my memory for drift," "audit my notes," "are there stale references."
- Scheduled run via `/schedule` — weekly cadence is a natural fit (see "Schedule offer" below).
- Do **not** auto-fire on session start, post-capture, or any hook. Mode A only.

## Inputs

1. **Audit scope.**
 - Default: `~/.claude/projects/<current-project-slug>/memory/`. Resolve the slug the same way [discover](../discover/SKILL.md) does (Glob `~/.claude/projects/*/memory/MEMORY.md`, pick by project-root match).
 - `--project <slug>` → audit a specific other project's memory tree. Useful for cross-project hygiene.
 - `--check <dimension>` → run only one dimension (skip the others). Dimensions named below.
2. **No content arguments** — audit consumes the existing memory tree, not new content.

## Procedure

### 1. Inventory the tree

Build the working set:

- Glob `<memory-root>/**/*.md` — every memory file plus session-recaps.
- Read `<memory-root>/MEMORY.md` — the index.
- For each memory file: parse frontmatter (`name`, `description`, `type`, `kind`, `scope`, `relevance`, `relations`, `superseded_by`); capture the body's first paragraph for duplicate detection.
- For session-recap files (under `sessions/<date>-<slug>.md`): parse filename and frontmatter only; bodies are not scanned for content checks.

Build maps:
- `path → frontmatter` for every file.
- `MEMORY.md line → target path` for every index entry.
- `path → list of incoming relations` (computed by reverse-walking every file's `relations:` field — used for orphan detection in dimension 6).

If the inventory pass fails on any file (parse error, malformed frontmatter), surface that as the first finding under dimension 2 and continue with what parsed. Don't abort the whole audit because one file is broken.

### 2. Run each dimension

Ten dimensions, run in parallel where possible. Each dimension produces zero or more findings; each finding includes:
- Dimension label.
- File path (and line number where applicable).
- Description (one-line, specific).
- Suggested fix (concrete, not "consider X"). When no obvious fix exists, mark "user judgment required" rather than inventing one.

If `--check <dimension>` was passed, run only that dimension; skip the others entirely. Otherwise, run all ten.

#### Dimension 1 — MEMORY.md index drift

- Files in the inventory not referenced from MEMORY.md → flag as "missing index entry" (suggest: add an index line). Exception: `sessions/` files are folder-discovered and exempt.
- MEMORY.md entries pointing to files that don't exist → flag "broken index link" (suggest: remove the entry, or confirm the file was renamed and update the path).
- MEMORY.md entries with paths that don't match the current file location (file was moved into a subfolder, link not updated) → flag "stale index path" (suggest: update the path to match the file's actual location).

#### Dimension 2 — Frontmatter validity

- Missing required fields per `claude-md/memory-capture.md` (`name`, `description`, `type`, `scope`, `relevance` — all mandatory) → flag the gap.
- `type` not in `{user | feedback | project | reference | session-recap}` → flag.
- `kind` (when present) not in `{architectural-rule | decision | lesson | preference | warning}` → flag.
- `scope` empty AND body is clearly domain-specific (heuristic: body mentions a specific module, language, or domain in the first paragraph) → flag for user judgment, suggest a more specific scope. Don't auto-fix — scope is judgment-laden.
- `relevance` missing or empty → flag.

Frontmatter parse errors from step 1 surface here as the first findings.

#### Dimension 3 — Broken `relations:` links

Skip silently when no memory file in the inventory has `relations:` populated (legacy mode — not yet adopted in this tree).

For every `relations:` entry across all files:
- Target file does not exist → flag "broken relation link" (suggest: remove the relation, or confirm the target was moved and update the path).
- `relations.type` not in `{supersedes | contradicts | supports | related_to}` → flag.
- `supersedes: target` but target doesn't have `superseded_by: <this-file>` (or vice versa) → flag "bidirectional integrity broken" (suggest: add the missing back-pointer).

#### Dimension 4 — Duplicate detection

For every pair of memory files where:
- `scope` sets overlap by ≥1 tag, AND
- The body's first-paragraph tokens overlap by ≥80% (tokenize on whitespace + punctuation, drop stopwords, compare as sets) —

flag as "possible duplicate" with both file paths. Suggest: review and decide whether to merge, supersede one with the other, or accept as intentional siblings (e.g. one general rule, one specific instance).

This is a heuristic — high false-positive rate is acceptable since the user makes the merge call. Do not auto-merge.

#### Dimension 5 — Stale references

Scan each memory file's body for:
- Repo-relative paths that look like real file references (`contexture/skills/X/`, `another-repo/research/Y.md`, `~/.claude/something`). For each, check existence on disk. Missing → flag "reference to missing file" (suggest: update the reference, or remove if no longer relevant).
- Git commit hashes (7-40 hex chars in a context that looks like a hash reference — preceded by "commit", "in `", "(`hash`)"). For each, run `git rev-parse --verify <hash>` against the relevant repo (memory body usually names the repo). If unresolvable, flag "stale commit reference."
- Proposal slot numbers (e.g. "", "slot 020"). Cross-reference against the project's `proposals/` directory to see if the slot still exists with the same shape (still queued / drafted / shipped per its coverage map). If the slot was renumbered or its status changed materially, flag "outdated proposal reference."

The git and proposal checks require knowing which repo / project to query; use the memory's `scope` tags as hints. Skip checks where the target repo can't be located rather than asserting failures.

#### Dimension 6 — Orphan files

For each file in the inventory:
- Not referenced from MEMORY.md (already flagged in dimension 1, but re-evaluate here in combination), AND
- No incoming `relations:` link from any other file (per the reverse-relations map built in step 1), AND
- Not under `sessions/` (which are folder-discovered) →

flag as "orphan candidate." Suggest: add to MEMORY.md, link from a related memory, or archive/remove if no longer relevant.

A file orphaned in MEMORY.md but reachable via a relation is *not* an orphan — it's findable through the relations graph. The dual-isolation criterion is what makes this a real orphan.

#### Dimension 7 — Superseded memories still surfacing

For each MEMORY.md entry whose target file has `superseded_by:` set in its frontmatter →
- Flag "superseded entry in index" (suggest: remove the index line; the entry remains readable in the file but should not be in the active index).

This catches the case where supersession was recorded in frontmatter but MEMORY.md wasn't updated in the same step., discovery already excludes superseded entries from the normal pool, but the index drift confuses readers and inflates the index.

#### Dimension 8 — Session-recap schema

For every file under `<memory-root>/sessions/`:
- Filename matches `YYYY-MM-DD-<slug>.md` (regex: `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$`). Misshaped → flag.
- Frontmatter present and parseable → flag if not.
- `type: session-recap` set → flag if missing or different.

These are the only checks against session-recap files. Their bodies are episodic and don't get the duplicate / stale-reference checks (recaps are stale by nature; that's their job).

#### Dimension 9 — Possible secrets in existing memory bodies interaction. Capture's step 7a runs the secret-pattern set at write time on new memories; this dimension is the retrospective sweep of memories already on disk (which were written before 025 shipped, or written when the pattern set was smaller, or pasted directly into files outside the capture flow).

Read the canonical pattern file: [`../capture/secret-patterns.md`](../capture/secret-patterns.md). Parse its JSON code-block to recover the pattern array.

For every memory file (including session-recaps) — for every pattern in the set — walk the body and frontmatter values, surface matches as `(file_path, line_offset, pattern_name, type_label, matched_text)`.

Each match is a finding:

```
- <path>:<line> — possible <type_label>: matched "<truncated>" (pattern: <pattern_name>). Suggest: review and redact, or mark as false positive.
```

Truncate `matched_text` to ≤40 chars when displaying (don't echo a full secret into the audit report). Use `<head>...<tail>` format for longer matches.

Resolution flow per finding (propose-confirm-commit):

- **Apply (redact)** — replace the matched text in the file with `<REDACTED:<pattern_name>>`. Same format as capture's step 7a. The file is rewritten in place.
- **Skip** — leave the file unchanged. The match stays. (Useful for triage runs where the user wants to see all candidates first before deciding.)
- **Ignore (false positive)** — leave the file unchanged AND append a row to `secret-patterns.md`'s false-positive table with the pattern name, sanitized match, and reason. Same log as capture's step 7a — keeps the false-positive corpus consolidated.
- **View detail** — show the file's surrounding lines, then re-prompt.

Never bulk-redact. Never silent-fix. Each finding is its own confirmation.

If `secret-patterns.md` is missing ( hasn't shipped yet), skip dimension 9 silently. The audit's other dimensions stand on their own.

#### Dimension 10 — Bloat: staleness/value + uncompressed bodies

The corpus grows unbounded; dimensions 4/6 catch duplicates/orphans but not *dead weight that is unique and valid*, nor *bodies that aren't in the model-optimized form*. This dimension is the anti-bloat sweep. Two sub-checks, both **propose-confirm** (never silent), both **demote-not-delete by default**.

**10a — Staleness / value.** Flag a memory as likely dead-weight when:
- `type: project` and the body is dominated by **finished-work facts** — status markers all `✓`/done, dated "state of play as of <past>", a work queue whose items are mostly shipped. (Heuristic: ≥70% of status tokens are done-state, or the body names a date >60 days old framed as "current".)
- A `lesson` / `architectural-rule` whose rule is now **encoded in a shipped skill or rule file** — the memory was the seed, the mechanism now carries it (cross-check: does a skill/rule cite or implement this?).
- A `warning` for a **tool / plugin / path that no longer exists** (cross-check the cited artefact still resolves).
- `relevance: always` on a memory that is **not actually always-relevant** — finished-work facts riding the always-on floor are the prime offender (this is the always-on injection cost). Suggest demoting to a phase/scope relevance, or off the floor entirely.

Resolution per finding: **demote** (drop `relevance: always`, or set `superseded_by` to archive it from discovery — file stays on disk), **trim** (cut the finished-work history, keep the live frontier), **delete** (only on explicit user confirm), or **skip**.

**10b — Uncompressed bodies.** Per [`../../docs/memory-compression-spec.md`](../../docs/memory-compression-spec.md), flag bodies still in human-prose form:
- Body > ~400 B with narrative markers ("this session", "it turned out", "we found", long subordinate clauses).
- A `**Why:**` line that fails the misapplication test (the why merely restates the rule / is self-evident → suggest dropping it).
- `description` or MEMORY.md hook that has been over-compressed into shorthand (the *inverse* — discovery surfaces must stay human-legible; flag if they went terse).

Resolution: **recompress** (apply the spec, show before/after, write on confirm) or **skip**. Never bulk-recompress silently — each is its own confirmation, same as every other dimension.

This dimension is judgment-heavy; lean toward flagging-for-review over auto-action. When unsure whether a memory is stale, surface it as "user judgment required" per §4's resolution flow rather than asserting it's dead.

### 3. Aggregate and prioritize

Group findings by dimension. Within each dimension, sort by:
- Files-touched first (findings about widely-referenced files surface ahead of isolated ones).
- Severity heuristic: broken links > validity > duplicates > orphans > stale > schema. (No formal severity tags; the dimension order in the report is the implicit ranking.)

Cap at top 50 findings per dimension to keep output digestible. If a dimension has more than 50, show the first 50 and note "(M more not shown — narrow with --check <dimension>)."

### 4. Report

Use this shape (sections omitted when the dimension has zero findings):

```
Memory audit: ~/.claude/projects/<slug>/memory/
Files scanned: N memory files + R session-recaps + MEMORY.md
Findings: T total

## MEMORY.md index drift (X)
- MEMORY.md:14 — link target `feedback/old_thing.md` doesn't exist. Suggest: remove the entry.
- feedback/new_thing.md — exists on disk, not referenced from MEMORY.md. Suggest: add an index line.

## Frontmatter validity (X)
- lessons/foo.md — `relevance` missing. Suggest: add a relevance clause.
-...

## Broken relations (X)
- decisions/bar.md:8 — `relations.target` points at `lessons/missing.md` which doesn't exist. Suggest: remove the relation.
- feedback/baz.md ↔ lessons/qux.md — supersedes declared on baz.md but qux.md has no superseded_by back-pointer. Suggest: add back-pointer to qux.md.

## Duplicates (X)
- feedback/parallel_tool_calls.md ↔ feedback_engineering_discipline.md — first-paragraph token overlap 82%, scope overlap on [global]. Likely intentional (one general, one specific) — flagged for user judgment.

## Stale references (X)
- project/build_progress.md:14 — references commit `abc1234` (contexture) which no longer resolves. Suggest: verify the hash or update the reference.
-...

## Orphans (X)
- lessons/very-old-thing.md — not in MEMORY.md, no incoming relations, not under sessions/. Suggest: archive, link, or add to index.

## Superseded entries in index (X)
- MEMORY.md:22 — entry points at `decisions/old_decision.md` which has `superseded_by: decisions/new_decision.md`. Suggest: remove the index line.

## Session-recap schema (X)
- sessions/wrong-shape-name.md — filename doesn't match YYYY-MM-DD-<slug>.md. Suggest: rename to follow convention.

## All other dimensions: Nothing material.

----
Apply proposed fixes? Choose per finding:
 1. Apply 2. Skip 3. Edit 4. View detail
```

### 5. Propose-confirm-commit per finding

For each finding with a concrete suggested fix:
- Show the finding + suggested action.
- Wait for user choice (Apply / Skip / Edit / View detail).
- On Apply → execute the fix (Edit / Write / nothing-and-record). Confirm what changed.
- On Skip → record "skipped, no action."
- On Edit → present the proposed action for the user to modify, then re-prompt.
- On View detail → show the relevant file content / context, then re-prompt the original question.

For findings flagged "user judgment required" (no concrete fix), show the finding and ask: "Action? (skip, manual fix, capture as TODO)."

Never silent-fix. Never bulk-apply. Each finding is its own decision.

After processing all findings (or the user signals "stop"), emit a summary:

> Audit complete. <Applied> applied, <Skipped> skipped, <Pending> deferred. Memory tree: <T-Applied-Skipped> findings remain.

### 6. Schedule offer (after first successful run)

After the first successful audit on a given memory tree, offer a recurring schedule per the schedule-skill's proactive-offer pattern:

> Want me to /schedule a weekly memory-audit so this stays clean? Cadence: weekly, Sunday 9am, summary report only — fixes still propose-confirm-commit when you next open the session.

User declines → record "weekly schedule offered, declined" so the offer doesn't fire on every audit. User accepts → invoke `/schedule` with the appropriate cadence.

## What memory-audit does NOT do

- **Does not auto-fire.** Mode A only.
- **Does not judge decision *validity*.** memory-audit owns **mechanical integrity** — is the `superseded_by` back-link present, is the relation target real, is the schema valid. It does **not** ask "*should* this decision be superseded — is it still true?" That validity judgment is [retrospect (060)](../retrospect/SKILL.md)'s. retrospect makes the call, then routes the resulting mechanical fix (the missing back-link, the broken reference) *back here*. Integrity vs validity: this organ owns the former, retrospect the latter.
- **Does not auto-fix.** Every finding is propose-confirm-commit.
- **Does not delete files silently.** Orphan removal is a user decision, never automatic.
- **Does not bulk-apply.** Each finding is its own confirmation.
- **Does not back up before changes.** The user's git commit habits are the rollback mechanism for memory tree files; if the memory tree is not git-tracked (the default per `feedback/sync_is_user_choice.md`), the user's chosen sync layer (or lack thereof) is the rollback.
- **Does not use embeddings.** Duplicate detection is text-overlap on the first paragraph. For ~50 memory files, regex + tokenization is sufficient. Vector search is overkill for our scale (deliberately not adopted).
- **Does not span multiple projects per invocation.** `--project <slug>` switches to a different project; it does not audit all projects in one pass. Cross-project audits would need a separate invocation per project.
- **Does not modify files outside the memory tree.** No edits to skills, codemap, or commands. Audit is scoped to memory.
- **Does not check audit findings against past audits** (no state). Each run is fresh. If a finding was deferred last run and the user wants it suppressed permanently, the user removes it manually or via a `--ignore` flag in v2 (not in v1 scope).

## Failure modes

- **Memory tree missing entirely** — report "no memory tree found at <path>" and stop. Don't create one.
- **MEMORY.md missing** — flag as the first finding ("MEMORY.md is missing — index cannot be checked"), continue with the file inventory's other dimensions.
- **A memory file's frontmatter is unparseable** — surface in dimension 2 as the first finding, continue with other files.
- **`git rev-parse` fails for a hash check** (no git available, or repo not located) — skip the check silently for that finding rather than asserting a stale reference. Note in the report: "git checks skipped — repo not located."
- **The user has another session writing to MEMORY.md mid-audit** — re-read MEMORY.md before each MEMORY.md-related fix to avoid clobbering. If the file changed mid-audit, re-run the affected findings.

## Limits (v1)

- Ten dimensions are deliberately scoped (eight original + dim 9 secret retro-scan from + dim 10 bloat: staleness/value + uncompressed-body, from the memory-compression spec). Adding an eleventh is a v2 conversation; surface the case to `/capture` before extending.
- Heuristics (duplicate threshold at 80%, dimension ordering, severity ranking) are deliberately simple. Tune in v2 with usage data, not speculatively.
- No persistent state between runs. If the user wants "remember I dismissed this finding," that's a v2 feature (similar to review's out-of-scope index).
