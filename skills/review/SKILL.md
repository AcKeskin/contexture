---
name: review
description: Audit code in scope against your architectural rules; report drift (dead code, SoC, monolith, missing-pattern, principle, comment-drift) with propose-confirm-commit per fix, then route misses to /capture. User-invoked, never auto-fires. Triggers on /review [path | --since <ref> | --vault], or "review this" / "audit the architecture" / "check for drift". Not a linter, not a security audit (use security-reviewer), not a PR review (use pr-review).
---

# review

The review organ. Implements. Consumes [discover (002)](../discover/SKILL.md), [deliver (012)](../deliver/SKILL.md), the [architectural-rules tree (006)](../../architectural-rules/README.md), and routes corrections through [capture (011)](../capture/SKILL.md).

Prep (004) prevents drift by priming before code is written. Review detects drift after the fact and proposes concrete cleanups. Different jobs, complementary.

## When to run

- User types `/review` / `/review <path>` / `/review --since <ref>`.
- Natural language: "review this", "audit the architecture", "check for drift", "look for dead code".
- **Do not auto-fire.** No session-end trigger, no task-end trigger, no hook-based trigger. explicitly parks continuous monitoring. User-invoked only.

## Inputs

- **Scope argument** (optional). Determines which files the scan covers.
- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Anchors project context and `.claude/architecture.md` lookup.
- **Git repo presence.** Enables `--since` scoping, TODO-age checks, and (optional) open/closed commit-history analysis. Degrade gracefully when absent.

## Procedure

### 1. Resolve scope

| Form | Resolution | | --- | --- | | `/review` (no args) | Entire project — every file under the project root, respecting `.gitignore` | | `/review <path>` | Directory (recursive) or single file | | `/review --since <ref>` | `git diff <ref>..HEAD --name-only` — only changed files. Bail with a clear message if not a git repo. Skips Phase-1 orientation (§2c) and the persistent artefact (§7b) — `--since` runs are ephemeral by nature | | `/review --vault` (combinable with any of the above) | Same scan, plus a copy written to the Obsidian vault per §7c. The in-repo `.claude/reviews/...` artefact is still produced. | | `/review --expand` (combinable with `--vault`) | Force the vault artefact to use the subfolder layout (§7c) even when no threshold tripped. Useful when the user knows up front this review will accumulate iterations or attached discussion. | | Natural language | Infer from task text; default to entire project when unclear; narrow with `/review <path>` hint if user said "the auth module" or similar. Phrases like "save this to Obsidian", "write to the vault", "put it in my notes" enable `--vault` for the run. | **>50 files guard.** If the resolved scope has more than 50 files, ask the user to narrow before proceeding:

> Scope resolves to N files — context cost high. Narrow with `/review <subdir>` or `/review --since <ref>`? (proceed anyway: `y`)

Proceed on explicit `y`.

### 2. Load architectural rules via discover

Invoke `skills/discover/SKILL.md` programmatically:

```
{
 task_keywords: [<derived from scope + explicit cues>],
 scopes: [<detected language>, <detected domain>, "global", "project-<name>"],
 kind: "architectural-rule",
 relevance_phases: ["always", "during-review"],
 top_n: 20,
 render_bodies: true,
 include_recaps: false
}
```

Read `<project-root>/.claude/architecture.md` directly if present — discover's codemap branch covers `codemap.md` only.

Cap the combined rule set at 20 fragments (same ceiling as prep).

**If zero rules load:** surface the empty result and proceed with dead-code + comment-drift checks only — those two categories are rule-agnostic. Ask the user whether to continue.

### 2b. Load out-of-scope index

Read every file under `<project-root>/.claude/review-out-of-scope/` if the directory exists. Index by `scope` + `finding-category` from each file's frontmatter. See [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) for format and matching rules. Skip silently if no directory.

### 2c. Phase-1 orientation gate

Runs **only** for unscoped or directory-scoped invocations (`/review`, `/review src/auth/`). Skip for file-scoped (`/review src/auth/middleware.ts`) and `--since` invocations — the user already pinned scope and the orientation cost dominates the value.

When triggered, perform these in order before §3:

1. **Manifest read.** Read whichever of `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `*.sln`, `composer.json`, `Gemfile`, `pom.xml`, `build.gradle*` exist at the project root. Note primary language, framework, declared dependencies count, scripts/entry points.
2. **Docs read.** Read top-level `README.md` plus any `docs/` and `adr/` (or `docs/adr/`) entries that exist. Skip `node_modules/` etc. Cap at ~10 files / ~3000 lines combined; sample biggest+newest if over.
3. **Structure map.** Glob top-level directories (depth 2) under the project root. Identify major modules / layers from naming.
4. **Churn data.** Run `git log --oneline -200` and `git log --stat --since="6 months ago" --pretty=format:` to see what's actually moving. Skip silently if not a git repo (no churn data, but orientation still proceeds with manifest + structure + docs).
5. **LOC × churn intersection.** Compute the intersection — files that are both top-20 by line count *and* top-20 by commit frequency in the last 6 months. **Most architectural drift hides in this intersection.** This list becomes a default scan-priority hint for §3 — scan these first when finding budget is tight.
6. **Mental model paragraph.** Synthesize 1–2 paragraphs describing the architecture as observed. **If the model contradicts the README, that contradiction is itself a finding** — surface it under Comment drift in §5 with a `file:line` citation pointing at the README claim.

Output the orientation block in §5's report header (before findings):

```
## Orientation
Stack: <language>, <framework>. <N> declared deps. Entry: <main script / binary>.
Layout: <one-line structure summary — e.g. "src/{api,domain,ui,services}; tests in tests/">
Churn (last 6mo): <top 3 high-churn paths>; <total commits over period>
Hot intersection (large × high-churn): N files
 - path/to/file.ext (L lines, C commits)
 - …
Mental model: <1–2 paragraph synthesis>
```

The intersection list is non-empty unless the project is too small or too new — when empty, say so explicitly (don't omit the line). Orientation is read-only; no findings emitted from it directly except the README-contradiction case noted above.

### 3. Scan files

For each file in scope:

1. Read the full content.
2. Run the six drift checks (see §"Drift checks" below).
3. Collect findings of shape `{id, file, line, category, severity, effort, what, rule_cited, proposed_fix}`. `id` is `F<NNN>` — assigned provisionally in scan order during this step, then reassigned in §4b for repeat runs (CARRIED findings reuse the baseline id; NEW findings continue numbering above the baseline's max). For fresh runs, the provisional id is the final id.
4. **`file:line` citation is mandatory.** Every finding must cite `path/to/file.ext:LINE` or a `file.ext:START-END` range. A finding that cannot point at a specific line is not a finding — it is pattern-matching, and it is rejected before reaching §4. Vague claims like "the code generally..." or "this module tends to..." do not pass this gate. The orientation paragraph in §2c is exempt (it is synthesis, not a finding); every concrete entry under a category in §5 is not.
5. A finding without a *rule* citation is only valid for the dead-code and comment-drift categories (self-evident). All other findings must cite a loaded rule — if the check triggers but no rule supports it, drop the finding rather than fabricating a rule name. (Independent of the `file:line` rule above; a finding needs both where applicable.)
6. Cross-check each finding against the out-of-scope index from §2b. Drop matches silently and increment the suppressed count.

### 4. Aggregate and prioritise

**Primary grouping is per-file.** Group all findings by file path first; within each file group, sort by Severity (Critical → Low) then Effort (S → L). Category becomes a tag on each finding and a roll-up summary table, not the primary structure. Files with zero findings are still surfaced (one-line "no findings") so the reviewer can see that the file was scanned.

Assign:

- **Severity** — Critical / High / Medium / Low. Anchored to confidence + impact:
 - Critical = clear rule breach, high blast radius (security-adjacent, data integrity, public API contract).
 - High = clear rule breach, localised impact; or probable drift that touches a load-bearing module.
 - Medium = probable drift, moderate impact; the typical category-3/4/5 finding.
 - Low = possible drift, weak confidence; informational dead code; minor comment drift.
- **Effort** — S / M / L:
 - S = under ~1h, single file, mechanical (rename, delete, extract).
 - M = ≈half-day, 2–5 files, design choice but small.
 - L = multi-day, >5 files, sequencing / coordination needed.

Cap at top 5 findings per file in the per-file detail section (the run-wide findings table stays uncapped within the global ceiling). Surplus reported as a count:

```
+3 more findings in this file — drill in with /review <path/to/file> for detail
```

A roll-up "Severity × Category" matrix (Critical/High/Medium/Low × Dead code/Monolith/SoC/Pattern/Principle/Comment drift) is rendered once before the per-file sections so the category-level signal is not lost.

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

If the baseline exists but is malformed (cannot parse the findings table, frontmatter missing required fields), log a one-line warning in the report header ("baseline at `<path>` malformed; treating run as fresh"), keep the prior file untouched, and proceed as fresh. Do not delete or rewrite a malformed baseline automatically.

### 5. Report

**Primary structure is per-file**, sorted by Severity within each file. Category appears as a tag on each finding and in the roll-up matrix — not as section headers.

Output shape:

```
Review of: <resolved scope> (N files, M lines)
Rules loaded: K architectural rules across language/domain/project scopes
Run mode: <fresh | repeat (baseline: v<N>.md, YYYY-MM-DD)> # see §4b

## Orientation # §2c — omit when skipped
Stack: <language>, <framework>. <N> declared deps. Entry: <main>.
Layout: <one-line structure summary>
Churn (last 6mo): <top 3 high-churn paths>; <total commits over period>
Hot intersection (large × high-churn): N files
 - path/to/file.ext (L lines, C commits)
 - …
Mental model: <1–2 paragraph synthesis>

Findings: T total (C critical, H high, M medium, L low)

## Severity × Category
| | Critical | High | Medium | Low | |--------------------|----------|------|--------|-----| | Dead code | 0 | 0 | 1 | 2 | | Monolithic files | 0 | 1 | 0 | 0 | | SoC violations | 0 | 0 | 2 | 0 | | Missing patterns | 0 | 0 | 1 | 1 | | Principle viol. | 1 | 0 | 0 | 0 | | Comment drift | 0 | 0 | 0 | 3 | ## Diagram # see §5b — mandatory section
<mermaid block, ASCII box-diagram, or one-line N/A justification>

## Per-file findings

### src/auth/middleware.ts (612 lines, 18 commits — hot)
- F001 [High/L] Monolithic files L1 — 612-line file mixing 4 concerns. Suggested split: <sketch>.
- F004 [Medium/S] SoC violations L210 — direct DB call from middleware layer. Move to services/.
- F008 [Low/S] Dead code L488 — exported `legacyParseToken` never imported.

### src/auth/utils.ts (87 lines, 3 commits)
- F012 [Low/S] Dead code L42 — exported `parseExpiry` never imported. Remove.

### src/auth/login-form.tsx — no findings

## Findings table
| ID | Category | File:Line | Severity | Effort | Description | Recommendation | |-------|------------------|-------------------------------|----------|--------|--------------------------------------------|-----------------------------------------| | F001 | Monolith | src/auth/middleware.ts:1 | High | L | 612-line file mixing 4 concerns | Split per bullet above | | F004 | SoC | src/auth/middleware.ts:210 | Medium | S | direct DB call from middleware layer | Move to services/ | | F008 | Dead code | src/auth/middleware.ts:488 | Low | S | exported `legacyParseToken` unused | Remove | | F012 | Dead code | src/auth/utils.ts:42 | Low | S | exported `parseExpiry` never imported | Remove | ## Quick wins (Low effort × Medium+ severity)
- [ ] F004 — Move middleware DB call to services/
- [ ] F045 — Extract duplicate validation block in checkout/

## Things that look bad but are actually fine (≥2)
- src/legacy/webhooks.ts:118 — deeply nested callback pattern preserves ordering the queue-based replacement would break. Leave it.
- src/auth/permissions.ts:240 — 180-line function is a flat dispatch table; splitting would obscure the 1-to-1 mapping that's the point.
- src/services/audit-service.ts:8 — `any` on the payload type is intentional; the audit log accepts arbitrary tool-call payloads by design.

----
Apply proposed fixes? Choose per finding:
 1. Apply 2. Skip 3. Edit 4. View detail
```

**Rules for the report sections:**

- Orientation block is omitted when §2c was skipped (file-scoped or `--since` runs).
- **Per-file sections are the primary structure.** Findings are sorted by Severity (Critical → Low) then Effort (S → L) within each file. Category is a column on the finding line, not a section header. Bullets capped at top 5 per file.
- **Severity × Category roll-up table** always present when T > 0 — replaces the old per-category bullet sections. Rows with all zeros may be omitted to keep the matrix tight.
- **Diagram section (§5b) is mandatory.** Try mermaid first, fall back to ASCII box-drawing, and only emit a one-line N/A justification when the scope genuinely doesn't lend itself to a diagram (e.g. single-file review of a leaf utility). See §5b.
- Files with zero findings still appear as `### <path> — no findings` so the reviewer can confirm the file was scanned, not skipped.
- Findings table is always present when T > 0 — uncapped within the run-wide ceiling, mirrors all findings across all files. Each row's ID matches the per-file bullet's ID.
- **Quick wins** is always present. When no Low-effort × Medium+-severity findings exist, render the section with an explicit one-liner ("None — no Low-effort × Medium+-severity findings in this run") rather than omitting.
- **"Things that look bad but are actually fine" is structurally required.** Enumerate at least 2–3 near-misses with reasoning. If genuinely none can be surfaced (very narrow scope, e.g. 1–2 files), report that explicitly with a one-line justification. An empty section without the justification is treated as audit incompleteness.
- If T = 0, skip per-file sections, the table, and Quick wins; still emit the diagram (or its N/A justification) and the "looks bad but fine" section, then skip straight to §8.
- **Output shape authority.** The grouping, diagram, suggestion-block, looks-bad-but-fine, table, and quick-wins rules above are the [review output contract](../../docs/review-output-contract.md). This skill consumes that contract — when the contract and this section ever diverge, the contract wins and this section is brought back into line. The one contract affordance that lives in the propose-fix step rather than the report is **suggestion blocks** (see §6).

### 5b. Diagram (mandatory)

Always try to include a diagram. The purpose is to give the reviewer a visual anchor for what the code looks like *as a system*, not just what changed line-by-line. Choose the diagram type that best fits what the review actually surfaced:

| Scope shape | Diagram type | | --- | --- | | Cross-module / cross-layer findings (boundary violations, layering issues) | Mermaid `flowchart` showing the violating edge(s) highlighted | | Monolith split proposal | Mermaid `flowchart` or ASCII box-diagram showing the proposed sub-module decomposition | | Sequence-level finding (race condition, ordering bug) | Mermaid `sequenceDiagram` | | State drift / lifecycle issue | Mermaid `stateDiagram-v2` | | Many small findings without a unifying structural story | ASCII bar chart of findings-per-file (counts severity-stacked) | | Single-file leaf utility, fewer than 3 findings, no structural angle | One-line N/A justification: `Diagram: N/A — single-file scope with no cross-module structure to visualise.` | **Preference order: mermaid > ASCII box-drawing > ASCII bar chart > N/A justification.** The N/A line must state the *why* — empty without reason is treated as incompleteness, same as the "looks bad but fine" section.

Render mermaid inside a fenced ` ```mermaid ` block. ASCII diagrams use box-drawing characters inside a plain fenced code block.

### 6. Propose-confirm-commit per finding

**Suggestion-block format for proposed fixes.** When a finding's `proposed_fix` is a concrete code change that is **≤10 lines, localised to one contiguous range in one file, and mechanically actionable** (no "you'll also need to update X elsewhere" caveats), the fix is rendered as a GitHub ` ```suggestion ` block in the finding's Recommendation — the literal replacement lines for the cited range, indentation matched to the cited file, no explanatory comments inside the block (those go in the prose above it). When any condition fails (bigger fix, spans files, has caveats, or is a judgment-call structural change), prose is correct — do not force a block. This is the [review output contract](../../docs/review-output-contract.md) §3 rule; it makes the recommendation appliable on GitHub and parseable by `pr-respond` when the review output is pasted into a PR.

Iterate findings in report order. For each:

- **Apply** → perform the edit via Edit / Write; confirm with a one-line report of the edit. Mark resolution `applied`.
- **Skip** → discard for this run. Mark resolution `skipped`. (Ephemeral; does not propagate into the next run's baseline as `WONT_FIX`.)
- **Edit** → accept user's revised fix; apply; confirm. Mark resolution `edited`.
- **View detail** → show fuller context (surrounding code, rule body, alternative fixes); loop to ask again.
- **Won't fix (note reason)** → ask the user for a one-line durable reason. Mark resolution `wont_fix` and store the reason on the finding. The next run will carry this finding forward tagged `WONT_FIX` (see §4b) and suppress it from Quick wins. If the reason is ephemeral ("not now", "later"), use Skip instead — the prompt should remind the user of the distinction. If the reason is structural enough that it belongs in the out-of-scope index (durable for *every* future run, not just the next one), offer option 5 from §9 inline instead.

Track counts of applied / skipped / edited / wont_fix per category. The Skip-with-load-bearing-reason inline shortcut to §9 option 5 still applies — that path writes to `.claude/review-out-of-scope/` and overrides the per-run `wont_fix` tagging.

No batch auto-apply. No silent fixes.

### 7. Summary

After per-finding resolution, report counts:

```
Applied N fixes across C categories. Skipped M. Edited K. Won't-fix W. Suppressed S (out-of-scope).
Repeat mode: N new, R resolved since last run, C carried, W carried as won't-fix. # repeat runs only
```

Omit the suppressed line when S = 0. Omit the repeat-mode line for fresh runs.

### 7b. Persist artefact

After §7, write the run's results to `<project-root>/.claude/reviews/<scope-slug>/`. This is the substrate the next repeat run reads (§4b).

**Slug derivation** (from the resolved scope):
- `/review` → `slug = project` (whole-project default).
- `/review src/auth/` → `slug = src-auth` (path with separators → kebab; trailing slash dropped).
- `/review src/auth/middleware.ts` → `slug = src-auth-middleware-ts` (extension included to disambiguate same-named files in different dirs is unnecessary; extension included for one-file slugs only).
- `/review --since HEAD~5` → **do not persist.** `--since` runs are ephemeral by nature; the file set is git-state-dependent and there is no stable scope to baseline against. Skip §7b for `--since` invocations.

**Versioning** (per the version-evolving-artefacts decision):
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
baseline: v<N>.md # repeat only; omit on fresh
supersedes: v<N>.md # repeat only; omit on fresh
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

| ID | … | Status | |-------|---|---------------| | F003 | … | applied | | F012 | … | wont_fix: <reason> | | F021 | … | open | `open` covers findings the user neither resolved nor declined; they are the default carry-forward signal for the next run.

**Atomicity:** write `v<N+1>.md` first, then rename `latest.md` → `v<N>.md` (if it exists), then copy `v<N+1>.md` → `latest.md`. If any step fails, leave the tree as-is and report the failure in the run summary; do not partially overwrite. Do not block §8 on write failure — the report has already been delivered to the user; the persistence step is a side effect.

The artefact is committable. Teams that want to track architectural debt over time can review the diff between `v3.md` and `v4.md` to see what closed, what opened, what moved. This is not a substitute for fixing things; it is a substrate for noticing trends.

### 7c. Obsidian vault output (opt-in)

On `/review --vault` (or a natural-language vault request — "save this to Obsidian", "put it in the vault", "write a copy to my notes"), **Read [`vault-output.md`](vault-output.md) and follow it** for the vault write: project-folder inference, filename, subfolder promotion, iterations, stub redirects, failure modes. This is in addition to §7b — the in-repo `.claude/reviews/...` artefact always writes regardless and is the repeat-run baseline.

Two rules stay inline (load-bearing): the vault root comes from `vaultRoot` in `~/.claude/hook-config.json` — **never hardcoded** (per `universal/no-hardcoded-machine-paths.md`); if it's unset, skip the vault write and surface *"Set `vaultRoot` in `~/.claude/hook-config.json` to write the review to the vault."* **Skip this section entirely when `--vault` was not requested** — do not read the sidecar on a normal run.

### 8. Feedback-loop prompt

At the end of every run (even zero-finding runs):

> Did this catch what you wanted? (y / n — n opens the feedback loop)

On `y` → end. On `n` or free-form correction → step 9.

### 9. Feedback loop

Offer four system-level responses:

1. **Sharpen existing rule.** Current rule exists but didn't catch the missed drift.
 - Ask which rule. Show candidates from the loaded set.
 - Draft a sharpened rule body.
 - Invoke `skills/capture/SKILL.md` with the sharpened body as candidate content + a note that this is an *overwrite* of the existing file at `<path>`. Capture's flow handles confirm + write.
2. **Add new rule.** No existing rule covers this.
 - Draft a new rule body from the user's correction.
 - Invoke `skills/capture/SKILL.md` with the draft. Capture classifies kind / scope / relevance, user confirms per capture's own flow.
3. **Retag existing rule.** Right rule, wrong scope — didn't load when it should have.
 - Ask which rule.
 - Propose a `scope` / `relevance` frontmatter edit.
 - Apply via Edit after user confirms.
4. **Adjust threshold.** Heuristic was too lax (e.g. file-length threshold too high).
 - Identify which threshold (from the table in §"Monolithic files" below, or elsewhere).
 - Two target options:
 - **Project-specific override** — write to a project memory with `scope: [project-<name>]`, `kind: architectural-rule`, describing the new threshold. Invoke capture.
 - **General adjustment** — propose an edit to this SKILL.md's threshold table. User explicitly confirms (this change ships to every machine via the subtree link).
5. **Record as out-of-scope.** The finding is real, but a load-bearing reason makes it the right call to leave it.
 - Confirm the reason is durable (would still apply to a future explorer), not ephemeral.
 - If structural enough that an ADR makes more sense, offer that instead.
 - Otherwise draft a `<project-root>/.claude/review-out-of-scope/<slug>.md` per [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) and write after user confirms.

User picks one (or none). Collaborator principle — never change silently.

The feedback loop also fires after individual finding dismissals during step 6 — when the user picks **Skip** with a load-bearing reason, offer option 5 inline instead of waiting for the end-of-run prompt.

## Drift checks

### 1. Dead code

- **Unused export.** A named export whose identifier does not appear in any other file within the project. Use Grep to verify. Exception: public-API packages where external consumers exist — warn in the finding.
- **Unused parameter.** A declared parameter not referenced anywhere in the function body.
- **Unreachable branch.** Code after an unconditional `return`, `throw`, or equivalent. `if (false) { … }`.
- **Commented-out code.** ≥5 contiguous commented lines that parse as code. Cite git blame if possible.

Dead-code findings are self-evident — no rule citation required.

### 2. Monolithic files

Per-language line thresholds (adjustable via feedback loop):

| Language | Threshold | | --- | --- | | C# | >400 | | TypeScript / JavaScript / JSX / TSX | >300 | | C++ / header files | >500 | | Python | >300 | | Go | >400 | | Rust | >400 | | Markdown / docs | N/A (skip) | | Other | >400 | Additional signals for this category:

- File declares more than 3 unrelated top-level concerns (distinct classes / top-level functions without shared state / distinct feature areas).
- A single function exceeds ~60 lines of non-trivial logic.

Cite the language threshold or the universal "small testable units" rule.

### 3. SoC violations

- Import crossing a boundary forbidden by a loaded rule (project rule like "/ui must not import /api directly", or domain rule).
- Side effects (I/O, DB, network calls) in files that rule / naming convention marks as pure (e.g. `*.types.ts`, `domain/*`).
- Logic in a layer that should be thin: business logic in UI components, transport logic in domain types.

All three require a rule citation. If no rule supports a suspected SoC violation, drop the finding — or, if the pattern is stark, note it as informational and ask the user whether to capture it as a rule via the feedback loop.

### 4. Missing pattern usage

- Switch / if-else chain with shared dispatch structure in a file scoped to a domain that has a captured strategy-pattern rule. Citation: the domain pattern rule.
- Repeated near-identical structure ≥3 times in scope. Citation: the universal DRY rule, if captured; otherwise drop.

### 5. Principle violations

- **SRP obvious case.** A class / module exposing public surface across ≥3 unrelated concerns. Example: `UserManager` handling auth + profile + preferences + billing.
- **Open/Closed edit-core-to-extend pattern.** Recent commits (last ~10) repeatedly edit the same switch / if-tree in a core file to handle new cases. Requires git history.
- Liskov / ISP / DIP — lower priority for v1. Only flag when a specific rule targets one of these.

All require rule citation (the universal SOLID rule, typically).

### 6. Comment drift

- Comment contains terminology or references that no longer appear in the adjacent code (e.g. mentions a removed function, an old type name).
- Public export without docstring / JSDoc / summary — only when a rule requiring docs on public API is loaded.
- TODO comments older than 20 commits. Requires git repo. Skip silently otherwise.

Comment-drift findings are self-evident for the first signal; the second needs the docs rule cited.

## Failure modes

- **Scope too large (>50 files) and user didn't narrow.** After the guard prompt, if user still says proceed, accept — but flag high context cost in the final summary.
- **Discover returned zero rules.** Fall back to dead-code + comment-drift only. Make this explicit in the report header.
- **Not a git repo but user passed `--since`.** Refuse with a clear message; suggest `/review <path>` instead.
- **Finding's proposed fix would conflict with uncommitted changes.** Check `git status` for the file before Edit; if dirty, pause and ask user to stash / commit first.
- **Feedback loop's "sharpen" target is in the global architectural-rules tree (not per-project memory).** Capture writes there per 006; proceed as normal. User's confirmation is the safety net.

## What review does NOT do

- **Does not auto-fire.** Not on any hook, not at any session / task boundary.
- **Does not replace a linter.** Syntax / style is lint's job.
- **Does not audit security, performance, accessibility, or i18n.** Separate skills, §"What this is not".
- **Does not apply fixes silently.** Every fix is propose-confirm-commit per finding.
- **Does not track findings across runs in any active sense.** The persistent artefact at `.claude/reviews/<scope-slug>/` (§7b) is a passive record — it is read on the next repeat run for tagging (NEW / CARRIED / RESOLVED / WONT_FIX) and is never re-played, executed, or used to prompt the user outside a fresh `/review` invocation. The out-of-scope index is also user-driven, not automatic.
- **Does not auto-suggest rule-tightening** based on recurring findings. Parked open questions.
- **Does not modify rule files itself.** Rule changes always route through capture (or an explicit Edit on retag / threshold adjustment after user confirms).
- **Does not write to the Obsidian vault unless asked.** The vault copy (§7c) is opt-in via `--vault` or natural-language request. The in-repo `.claude/reviews/...` artefact always writes; the vault copy is a side-channel for human browsing.
- **Does not silently promote a vault file to a subfolder.** Promotion (≥2 iterations, >3000 lines, or `--expand`) is always proposed first.

## Relationship to other organs

- **discover (002)** — rule retrieval. Same pattern as prep.
- **deliver (012)** — rule-body rendering inside discover. `render_bodies: true` on every call.
- **capture (011)** — feedback-loop writeback. Sharpen / add / retag / adjust-threshold all route through capture where they involve writing to the memory tree.
- **prep (004)** — complementary. When review keeps finding the same drift in an area prep should have covered, the prep rule for that scope needs sharpening. The feedback loop routes that change.
- **architectural-rules tree (006)** — the corpus. Review's quality is bounded by the corpus's quality. Feedback loop is how the corpus improves.
- **recap (013)** — review findings are not automatically captured; the user can ask `/recap` separately after a review if the run produced notable learnings.

See [`docs/review-organ.md`](../../docs/review-organ.md) for the scope map and rationales.
