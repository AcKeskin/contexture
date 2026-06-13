# Review — the review organ

Implements. Authoritative procedure lives in [`skills/review/SKILL.md`](../skills/review/SKILL.md); this doc is the Claude-facing reference.

Prep (004) prevents drift; review detects it. Different jobs, complementary. Together they close the discipline loop — a rule exists (001/006), it's primed before work (004), it's audited after (005), and user corrections feed back into the corpus (011).

## What review owns

- **Post-hoc architectural audit.** Scan files in scope against loaded rules; identify drift; propose concrete fixes.
- **Six drift-check categories.** Dead code, monolithic files, SoC violations, missing pattern usage, principle violations, comment drift.
- **Per-finding propose-confirm-commit.** Apply / skip / edit / view-detail. No silent fixes.
- **User-correction feedback loop.** Turn a missed finding into a system improvement (sharpen / add / retag a rule, or adjust a threshold) routed through capture.

## What review inherits / does not own

| Concern | Source | What review does | | --- | --- | --- | | Rule storage + tagging | [001 storage tagging](storage-tagging.md) + [006 architectural-rules](architectural-rules.md) | Reads the rule corpus; never writes except via capture | | Retrieval | [002 discover](discover.md) | Consumes as a caller with `during-review` phase filter | | Body rendering | [012 deliver](delivery-organ.md) | Passes `render_bodies: true`; deliver owns the format contract | | Rule capture / sharpening / addition | [011 capture](capture-organ.md) | Feedback loop routes every rule change through capture | | Pre-work priming | [004 prep](prep-organ.md) | Complementary — review informs prep when the same drift recurs | | Project architecture file format | [006 project-architecture](project-architecture.md) | Reads `.claude/architecture.md` directly (not via discover) | | Syntax / style linting | External linters | Not review's job | | Security / performance / accessibility / i18n audits | Future skills | Out of scope | Review coordinates reads + heuristics + user interaction. Writes route through capture.

## Trigger — user-invoked only

- `/review [scope]` — explicit slash command.
- Natural language: "review this", "audit the architecture", "check for drift", "look for dead code".

**No auto-fire.** explicitly parks continuous monitoring and session-end auto-run. Reasons:

- Auto-running on every change is expensive and noisy (that's the parked continuous-monitoring organ).
- Session-end auto-run is fragile — sessions don't have clean endings.
- User-invoked matches discover/capture/recap conventions and respects user attention.

Typical use:

- After significant changes, before merging.
- When the user feels lost ("two sessions in, I can't see what I've done").
- Before declaring a feature complete.
- On demand for a narrow scope when the user suspects drift in a specific area.

## Scope forms

| Form | Scope | Phase-1 orientation | Persistent artefact | | --- | --- | --- | --- | | `/review` | Entire project. Respects `.gitignore` when present | Yes | Yes — `<scope_slug>=project` | | `/review <path>` (directory) | Directory recursively | Yes | Yes — `<scope_slug>=<path-kebab>` | | `/review <path>` (single file) | One file | No | Yes — `<scope_slug>=<path-with-extension>` | | `/review --since <ref>` | Files changed since the git ref. Bails cleanly when not a git repo | No | **No** — `--since` runs are ephemeral | **>50 files guard.** Review asks the user to narrow before proceeding on very large scopes. Explicit `y` overrides.

## Phase-1 orientation gate

For unscoped or directory-scoped runs, review primes itself before scanning files. The orientation block becomes the report header. Six steps:

1. **Manifest read** — `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `*.csproj` (whichever apply). Pulls language, framework, declared dependency count, entry point.
2. **Docs read** — top-level `README.md` plus `docs/` and `adr/` entries (capped at ~10 files / ~3000 lines).
3. **Structure map** — top-level directories, depth 2, named after their apparent layer.
4. **Churn data** — `git log --oneline -200` and `git log --stat --since="6 months ago"`. Skipped silently if not a git repo.
5. **LOC × churn intersection** — files in both top-20 by line count *and* top-20 by commit frequency. Most architectural drift hides here. The list becomes a default scan-priority hint when the finding budget is tight.
6. **Mental model paragraph** — 1–2 paragraph synthesis. If the model contradicts the README, that contradiction is itself surfaced as a Comment-drift finding.

The orientation block is read-only — no findings emitted from it directly except the README-contradiction case. File-scoped and `--since` runs skip the gate entirely (the user already pinned scope, the orientation cost dominates the value).

## Drift categories

Summary — see [`skills/review/SKILL.md`](../skills/review/SKILL.md) for the concrete signals per category.

1. **Dead code** — unused exports (verified with Grep across project), unused parameters, unreachable branches, commented-out code blocks ≥5 lines. Self-evident — no rule citation required.
2. **Monolithic files** — per-language line thresholds (C# >400, TS >300, C++ >500, Py >300, Go >400, Rust >400, others >400), >3 unrelated top-level concerns in one file, or a single function >~60 lines of non-trivial logic.
3. **SoC violations** — import crossing a boundary forbidden by a loaded rule; side effects in files marked pure; logic in layers that should be thin. Rule citation mandatory.
4. **Missing pattern usage** — switch / if-else chains in scopes with a captured strategy-pattern rule; repeated structures ≥3 times triggering DRY. Rule citation mandatory.
5. **Principle violations** — SRP obvious cases (a class doing ≥3 unrelated things), Open/Closed edit-core-to-extend patterns visible in git history. Liskov/ISP/DIP lower priority for v1.
6. **Comment drift** — comments contradicting adjacent code, public exports without docstrings (only when a rule requires them), TODO comments >20 commits old (requires git).

Rules-mandatory findings drop (do not fabricate) when no loaded rule supports them.

**`file:line` citation is mandatory.** Every concrete finding cites `path/to/file.ext:LINE` (or a range). A finding that cannot point at a specific line is rejected — it is pattern-matching, not a finding. The orientation paragraph is exempt (it is synthesis, not a finding).

## Severity and Effort

Every finding is annotated with both:

- **Severity** — Critical / High / Medium / Low. Anchored to confidence + impact (Critical = clear breach, high blast radius; Low = possible drift, weak confidence).
- **Effort** — S / M / L (≈ < 1h / ≈ half-day / ≈ multi-day, scaled by file count and design-choice depth).

Within a category, findings sort Severity (Critical → Low) then Effort (S → L).

## Output format

```
Review of: <resolved scope> (N files, M lines)
Rules loaded: K architectural rules across language/domain/project scopes
Run mode: fresh | repeat (baseline: v<N>.md, YYYY-MM-DD)

## Orientation # omitted on file-scoped / --since runs
Stack: <language>, <framework>. <N> declared deps. Entry: <main>.
Layout: <one-line structure summary>
Churn (last 6mo): <top 3 high-churn paths>; <total commits>
Hot intersection (large × high-churn): N files
 - path/to/file.ext (L lines, C commits)
Mental model: <1–2 paragraph synthesis>

Findings: T total (C critical, H high, M medium, L low)

## Dead code (X)
- F012 [Low/S] path:line — what. Proposed fix.

## Monolithic files (X)
- F003 [High/L] path (L lines) — exceeds threshold (T). Concerns: …. Suggested split: ….

## SoC violations (X)
- F021 [Medium/S] path:line — what. Rule cited: <rule name>. Proposed fix.

## Missing pattern usage / Principle violations / Comment drift
- …

## Findings table
| ID | Category | File:Line | Severity | Effort | Description | Recommendation | |-------|------------|---------------------------|----------|--------|------------------------------|---------------------------------| | F001 | Monolith | src/auth/middleware.ts:1 | High | L | 612-line file, 4 concerns | Split per bullet section above | | … | … | … | … | … | … | … | ## Quick wins (Low effort × Medium+ severity)
- [ ] F021 — Move login-form fetch to services/auth-service.ts
- …
(or "None — no Low-effort × Medium+-severity findings in this run" when empty)

## Resolved since last run (X) # repeat runs only
- F003 — was 612 lines, now 287; split landed
- …

## Things that look bad but are actually fine (≥2)
- src/legacy/webhooks.ts:118 — looks like a refactor target, but it preserves ordering
 guarantees the queue-based replacement would break.
- …

## Carried as won't-fix # repeat runs only
- F042 — exported `parseExpiry` (reason: kept for vendored external integration)

----
Apply proposed fixes? Choose per finding:
 1. Apply 2. Skip 3. Edit 4. View detail 5. Won't-fix (note reason)
```

**Section discipline:**

- Orientation is omitted on file-scoped and `--since` runs.
- Bullets cap at 5 per category for at-a-glance scanning; the table mirrors the same findings, capped only by the run-wide ceiling.
- Quick wins is always present — when no Low × Medium+ findings exist, it says so explicitly rather than being omitted.
- "Things that look bad but are actually fine" is structurally required. ≥2 entries with reasoning, or an explicit one-line justification when scope is too narrow ("scope was three files; no near-misses considered worth surfacing"). An empty section without justification is treated as audit incompleteness.
- Categories with zero findings are omitted. If total findings = 0, bullets/table/quick-wins are skipped but the looks-bad-but-fine section (or its justification) still runs, then the report jumps to the feedback prompt.

## Propose-confirm-commit per finding

Five options per finding:

1. **Apply** — Claude performs the edit via Edit/Write, confirms with a one-line report.
2. **Skip** — discard for this run (ephemeral; does not propagate to the next run).
3. **Edit** — user provides a revised fix, Claude applies it.
4. **View detail** — show surrounding context, rule body, alternative fixes; then loop to ask again.
5. **Won't-fix (note reason)** — record a one-line durable reason. Carries to the next run via the persistent artefact (tagged `WONT_FIX`) and is suppressed from Quick wins. For reasons durable enough to apply to *every* future run (not just the next), use option 5 from the feedback loop ("Record as out-of-scope") instead — that path writes to `.claude/review-out-of-scope/`.

No batch auto-apply. No silent fixes. Dirty-file check (`git status`) before Edit — if uncommitted changes would conflict, pause and ask.

## User-correction feedback loop

The user is the final check. When review misses something and the user catches it, the *correction itself* should improve the system — not just fix the immediate issue.

At the end of every run:

> Did this catch what you wanted? (y / n)

On `n` or free-form correction, five system-level responses:

1. **Sharpen existing rule.** Current rule exists but didn't catch this. User picks the rule; review drafts a sharpened body; invokes `/capture` to overwrite the existing file at its canonical path after user confirms.
2. **Add new rule.** No existing rule covers this. Review drafts one from the correction; invokes `/capture` to classify `kind` / `scope` / `relevance` and write.
3. **Retag existing rule.** Right rule, wrong scope — didn't load when it should have. User picks the rule; review proposes a `scope` / `relevance` frontmatter edit; applies after user confirms.
4. **Adjust threshold.** Heuristic was too lax. Two targets:
 - **Project-specific override** — capture writes a project memory with the new threshold scoped to `project-<name>`.
 - **General adjustment** — edit SKILL.md's threshold table (git-tracked, syncs to every machine).
5. **Record as out-of-scope.** The finding is real but a load-bearing reason makes it the right call to leave it (durable for *every* future explorer, not just the next run). Review drafts a `<project-root>/.claude/review-out-of-scope/<slug>.md` per the OUT-OF-SCOPE format; subsequent runs match against the index and suppress silently. If the reason is structural enough that an ADR makes more sense, review offers that path instead.

User picks one (or none). Collaborator principle — nothing changes silently.

The feedback loop also fires inline during the per-finding loop: when the user picks **Skip** with a load-bearing reason, review offers option 5 immediately rather than waiting for the end-of-run prompt.

### Why the feedback loop matters

Without it, every user correction is one-shot. With it, the system gets measurably harder to fool over time — the architectural-rules corpus improves where review misses, and prep's priming picks those improvements up on the next run.

This is how prep + review become better than checklists: they learn from being wrong.

## Relationship to prep

- **Prep prevents** what it can by priming rules before code is written.
- **Review detects** what slipped through by auditing existing code.
- **The feedback loop connects them** — when review keeps finding the same drift that prep should have prevented, the prep rule for that scope needs sharpening (or the rule was right but wasn't loaded because of a scope mistag).
- Auto-suggesting prep-rule tightening when review finds recurring drift is parked open questions — manual for v1.

## Repeat runs and the persistent artefact

Each `/review` run that has a stable scope (everything except `--since`) writes its full report to `<project-root>/.claude/reviews/<scope-slug>/`. The artefact is the substrate the next run reconciles against.

**Slug derivation:**

- `/review` → `slug = project`
- `/review src/auth/` → `slug = src-auth` (path with separators kebab-cased, trailing slash dropped)
- `/review src/auth/middleware.ts` → `slug = src-auth-middleware-ts` (extension included for one-file slugs)
- `/review --since <ref>` → not persisted (ephemeral)

**Versioning** (per the version-evolving-artefacts decision):

- The previous run's `latest.md` is renamed to `v<N>.md` (where `N` is the next free index).
- The new run is written as both `v<N+1>.md` *and* `latest.md` — same content, two paths. `latest.md` is the cheap "is there a baseline?" lookup; `v<N>.md` is the stable archive.
- The new file's frontmatter sets `supersedes: v<N>.md` (omitted on the first run).

**Repeat-run reconciliation:** when `latest.md` exists, review parses its findings table and matches new-run findings against the baseline (category-equal + line ±5 or near-identical `what` string). Each finding gets one of:

- `CARRIED` — present in both runs (open). Reuses the baseline ID so the artefact diff is meaningful.
- `NEW` — present in this run only. Assigned a fresh ID continuing above the baseline's max.
- `RESOLVED` — present in baseline (open) but not in this run. Surfaced under "Resolved since last run" — not silently dropped.
- `WONT_FIX` — carried from baseline with the prior reason. Suppressed from Quick wins, listed at the bottom.

A malformed baseline (table unparseable, frontmatter missing required fields) triggers a one-line warning and the run proceeds as fresh; the prior file is never deleted or rewritten.

**The artefact is committable.** Diffing `v3.md` against `v4.md` shows what closed, what opened, what moved — a substrate for noticing trends. It is not a substitute for fixing things.

## Caps and budgets

- **20 rules max** loaded per run (same ceiling as prep).
- **5 findings max per category in the bullets.** The findings table mirrors the same set, capped only by a run-wide ceiling. Surplus reported as counts with a suggestion to narrow scope.
- **50 files** soft guard on scope — user can override with `y`.
- **Manifest + docs read** capped at ~10 files / ~3000 lines combined during the orientation gate; sample biggest+newest if over.
- **No cap on feedback-loop rounds.** Each picked response is a single capture invocation.

## What review is not

- Not a linter replacement.
- Not a security audit.
- Not a performance review.
- Not a test coverage report.
- Not auto-cleanup.
- Not exhaustive — six categories cover the stated pain; other concerns become their own skills later.
- Not auto-firing.
- Not actively tracked across runs. The persistent artefact at `.claude/reviews/<scope-slug>/` is read on the *next* `/review` invocation for tagging — review never re-plays it, never prompts the user about old findings outside a fresh invocation.

## Debug

- **Zero rules loaded, so review fell back to dead-code + comment-drift only.** Likely cause: scope detection returned only `[global]` and none of the global rules are tagged `during-review`. Tag a few core universal rules with `during-review` relevance, or invoke `/review` with explicit scope hints.
- **False positives on monolith / SRP / pattern checks.** Expected — these are heuristic. Every finding cites the rule so the user can judge. Use the feedback loop's "adjust threshold" option if the heuristic is systematically wrong.
- **`--since` bailed because not a git repo.** Use `/review <path>` instead.
- **Dirty-file check keeps pausing fixes.** Stash or commit before the review run.
- **Feedback loop's "sharpen" wrote to the global tree (not project memory).** That's correct — global rules live in `~/.claude/architectural-rules/`. If you intended a project-specific override, use "add new rule" scoped to `project-<name>` instead.
- **Orientation block missing on a scope you expected it for.** Orientation runs only for unscoped or directory-scoped invocations. `/review src/auth/middleware.ts` (single file) and `/review --since HEAD~5` skip it deliberately. Pass a directory or run unscoped if you want orientation.
- **"Things that look bad but are actually fine" section is empty.** Not allowed without an explicit one-line justification. If review produced an empty section without justification, that's a skill bug — re-run and check the output. Genuinely empty is acceptable on very narrow scopes (one or two files) but the justification line must say so.
- **Repeat-run baseline at malformed.** Review logs a one-line warning in the report header and proceeds as fresh. The prior `latest.md` is left untouched. Inspect it manually and either fix the frontmatter / table or delete it before the next run.
- **Persistent artefact didn't get written.** Either you ran `/review --since` (intentional — `--since` runs are not persisted), the write step failed (check `.claude/reviews/<slug>/` for partial state — review writes atomically, so partial state means an explicit failure was reported in the run summary), or the project root isn't writable.
