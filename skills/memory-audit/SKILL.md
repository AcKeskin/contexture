---
name: memory-audit
description: Audit the project's memory tree for integrity drift + bloat — orphans, duplicates, broken relations, stale references, schema gaps, uncompressed bodies. Ten dimensions, propose-confirm-commit per finding, read-only by default. Use when the user types /memory-audit. Mode A only — never auto-fires.
---

# memory-audit

Sibling of [review](../review/SKILL.md) — same flow, but scoped to the memory tree (`~/.claude/projects/<slug>/memory/`) instead of code.

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
- For each memory file: parse frontmatter (`name`, `description`, `type`, `kind`, `scope`, `relevance`, `relations`, `superseded_by`); capture the body's first paragraph for duplicate detection. Batch the Reads — independent files in one message, not one call per file.
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

#### Dimension 1 — MEMORY.md index drift

- Files in the inventory not referenced from MEMORY.md → flag as "missing index entry" (suggest: add an index line). Exception: `sessions/` files are folder-discovered and exempt.
- MEMORY.md entries pointing to files that don't exist → flag "broken index link" (suggest: remove the entry, or confirm the file was renamed and update the path).
- MEMORY.md entries with paths that don't match the current file location (file was moved into a subfolder, link not updated) → flag "stale index path" (suggest: update the path to match the file's actual location).

#### Dimension 2 — Frontmatter validity

- Missing required fields per `claude-md/memory-capture.md` (`name`, `description`, `type`, `scope`, `relevance` — all mandatory) → flag the gap. **Exception: `type: session-recap` files are exempt from `relevance`** — recaps are episodic records, not relevance-gated rules, and their frontmatter deliberately omits it.
- `type` not in `{user | feedback | project | reference | session-recap}` → flag.
- `kind` (when present) not in `{architectural-rule | decision | lesson | preference | warning}` → flag.
- `scope` empty AND body is clearly domain-specific (heuristic: body mentions a specific module, language, or domain in the first paragraph) → flag for user judgment, suggest a more specific scope. Don't auto-fix — scope is judgment-laden.
- `relevance` missing or empty → flag.
- `superseded_by: retired` without a `retired_reason:` → flag "retired without reason" (suggest: add one line on why it was wrong).

#### Dimension 3 — Broken `relations:` links

Skip silently when no memory file in the inventory has `relations:` populated (legacy mode — typed relations not yet adopted in this tree).

For every `relations:` entry across all files:
- Target file does not exist → flag "broken relation link" (suggest: remove the relation, or confirm the target was moved and update the path).
- `relations.type` not in `{supersedes | contradicts | supports | related_to}` → flag.
- `supersedes: target` but target doesn't have `superseded_by: <this-file>` (or vice versa) → flag "bidirectional integrity broken" (suggest: add the missing back-pointer). `superseded_by: retired` has no target by design; skip it here.

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
- Design-doc / slot numbers a memory cites by id — cross-reference against the project's planning docs; if renumbered or materially changed, flag "outdated reference."

The git and design-doc checks require knowing which repo / project to query; use the memory's `scope` tags as hints. Skip checks where the repo can't be located rather than asserting failures. Note in the report: "git checks skipped — repo not located."

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

This catches the case where supersession was recorded in frontmatter but MEMORY.md wasn't updated in the same step. Discovery already excludes superseded entries from the normal pool, but the index drift confuses readers and inflates the index.

#### Dimension 8 — Session-recap schema

For every file under `<memory-root>/sessions/`:
- Filename matches `YYYY-MM-DD-<slug>.md` (regex: `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$`). Misshaped → flag.
- Frontmatter present and parseable → flag if not.
- `type: session-recap` set → flag if missing or different.

These are the only checks against session-recap files. Their bodies are episodic and don't get the duplicate / stale-reference checks (recaps are stale by nature; that's their job).

#### Dimension 9 — Possible secrets in existing memory bodies

Read [dimensions.md](dimensions.md), *Dimension 9*, and run it.

#### Dimension 10 — Bloat: staleness/value + uncompressed bodies

Read [dimensions.md](dimensions.md), *Dimension 10*, and run it.

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

## Broken relations (X)
- feedback/baz.md ↔ lessons/qux.md — supersedes declared on baz.md but qux.md has no superseded_by back-pointer. Suggest: add back-pointer to qux.md.

## All other dimensions: Nothing material.

----
Apply proposed fixes? Choose per finding:
  1. Apply  2. Skip  3. Edit  4. View detail
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

More in [reference.md](reference.md): What memory-audit does NOT do, failure modes, limits (v1).
