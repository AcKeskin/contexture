# review — reconciliation and persistence

Bookkeeping detail for `review`'s repeat-run reconciliation (§4b) and persisted artefact (§7b). The SKILL.md keeps the behavior summary and the load-bearing rules; this file carries the mechanics, loaded when a repeat run or a persist step actually needs them.

### 4b. Repeat-run reconciliation

If a prior review artefact exists for the resolved scope, treat it as a baseline. The artefact location is `<project-root>/.claude/reviews/<scope-slug>/latest.md` — see §7b for slug derivation, write semantics, and frontmatter.

When `latest.md` exists:

1. **Set Run mode = repeat** in the report header. Show the baseline filename and date.
2. **Read the baseline.** Parse its findings table to extract `{id, file, line, category, what, status}` for every prior finding. `status` ∈ `{open, RESOLVED, WONT_FIX}` from the prior frontmatter / inline tags.
3. **Match new-run findings against baseline.** Two findings match when category is identical and either:
   - file path + line are within ±5 lines (line drift tolerance for edits above), or
   - file path + a near-identical `what` string (Levenshtein under ~30% of the shorter — concept-level match for code that moved).
4. **Tag every finding in the new run:**
   - `CARRIED` — present in baseline (open) and present in this run; reuse the baseline `id` so the artefact diff is meaningful.
   - `NEW` — present in this run, no baseline match. Assign a fresh `F<NNN>`, continuing from the highest baseline ID + 1.
   - `WONT_FIX` — present in baseline tagged `WONT_FIX` and still present in code. Reuse the baseline `id`. Suppress from Quick wins. List at the bottom of the report under "Carried as won't-fix" with the prior reason quoted.
5. **Compute resolved.** Findings present in baseline (open) with no match in this run are tagged `RESOLVED`. List them in a "Resolved since last run" section before "Things that look bad but are actually fine":

```
## Resolved since last run (X)
- F003 — src/auth/middleware.ts monolith (was 612 lines, now 287; split landed)
- F012 — src/auth/utils.ts dead `parseExpiry` export (removed)
```

Resolved findings are not silently dropped — surfacing them is half the point of repeat mode.

When no `latest.md` exists, set Run mode = fresh, skip this step, and proceed to §5 with all IDs assigned in scan order from F001.

If the baseline is malformed (unparseable findings table, frontmatter missing required fields), log a one-line warning in the report header ("baseline at `<path>` malformed; treating run as fresh") and proceed as fresh — never delete or rewrite a malformed baseline automatically.

### 7b. Persist artefact

After §7, write the run's results to `<project-root>/.claude/reviews/<scope-slug>/`. This is the substrate the next repeat run reads (§4b).

**Slug derivation** (from the resolved scope):
- `/review` → `slug = project` (whole-project default).
- `/review src/auth/` → `slug = src-auth` (path with separators → kebab; trailing slash dropped).
- `/review src/auth/middleware.ts` → `slug = src-auth-middleware-ts` (extension included for single-file slugs).
- `/review --since HEAD~5` → **do not persist.** `--since` runs are ephemeral by nature; the file set is git-state-dependent and there is no stable scope to baseline against. Skip §7b for `--since` invocations.

**Versioning** — versioned artefacts evolve by appending a new version with a supersedes pointer, never by overwriting:
- If `latest.md` exists: rename to `v<N>.md` where `N` = highest existing `v<N>.md` + 1 (or 1 if none).
- Write the new run as both `latest.md` and `v<N+1>.md`. Identical content; two paths for cheap "is there a baseline?" lookup + stable per-version archival.
- The new file's frontmatter sets `supersedes: v<N>.md` when a prior version exists; omit on the first run.

**File shape:**

```markdown
---
date: YYYY-MM-DD
scope: <resolved scope as the user passed it>
scope_slug: <slug>
run_mode: fresh | repeat
baseline: v<N>.md       # repeat only; omit on fresh
supersedes: v<N>.md     # repeat only; omit on fresh
findings_total: T
counts:
  critical: C
  high: H
  medium: M
  low: L
resolutions:
  applied: N
  skipped: M
  edited: K
  wont_fix: W
  suppressed: S
---

<full §5 report body verbatim — orientation, bullets, table, quick wins, looks-bad-but-fine, plus repeat-run sections (Resolved / Carried as won't-fix) when applicable>
```

**Per-finding state in the table** (used by §4b on the next run): the table's rightmost column gains a `Status` field for repeat-mode artefacts:

| ID    | … | Status        |
|-------|---|---------------|
| F003  | … | applied       |
| F012  | … | wont_fix: <reason> |
| F021  | … | open          |

`open` covers findings the user neither resolved nor declined; they are the default carry-forward signal for the next run.

**Atomicity:** write `v<N+1>.md` first, then rename `latest.md` → `v<N>.md` (if it exists), then copy `v<N+1>.md` → `latest.md`. If any step fails, leave the tree as-is and report the failure in the run summary; do not partially overwrite. Do not block §8 on write failure — the report has already been delivered to the user; the persistence step is a side effect.

The artefact is committable — the version-to-version diff is a substrate for tracking architectural debt trends, not a substitute for fixing things.
