---
name: retrospect-core
description: Shared engine for the meta-review organs — orientation pass, NEW/CARRIED/RESOLVED baseline diffing, propose-confirm-commit-with-routing, and 042-contract report rendering. Library-only — callable by retrospect and system-review (and any future meta-review skill), not user-invoked. There is no /retrospect-core command. Stateless per call except for the report artefacts it persists.
---

# retrospect-core

The meta-review engine. Implements the shared spine of. It is to [retrospect](../retrospect/SKILL.md) and [system-review](../system-review/SKILL.md) what [deliver (012)](../deliver/SKILL.md) is to discover/prep/review: one mechanism, many consumers, so the meta-review skills stay single-responsibility without duplicating the engine.

It does **not** know how to find decision drift or organ overlap — that domain logic lives in the calling skill's *passes*. retrospect-core owns the four things every meta-review run shares: orient, diff against the prior run, render per the [review output contract (042)](../../docs/review-output-contract.md), and route each confirmed finding to the organ that actually fixes it.

## When to run

- A meta-review skill (`retrospect`, `system-review`) invokes one of the functions below programmatically.
- **Do not** respond to user prose triggers. There is no `/retrospect-core` command and no "when the user says X" branch. It is a format-and-orchestration helper.
- Stateless per call, with one exception: `persist` writes a report artefact to disk (the substrate the next run's `diff` reads).

## The contract

The caller (retrospect / system-review) owns:
- **Which corpus** to point at and **where its files live**.
- **The passes** — the domain logic that produces findings.

retrospect-core owns:
- `orient(target)` — inventory + since-last-run delta.
- `diff(findings, baselinePath)` — NEW/CARRIED/RESOLVED/WONT_FIX tagging.
- `render(report)` — the 042-contract report body.
- `route(finding)` — propose-confirm-commit, then hand off to capture / memory-audit / a proposals stub.
- `persist(report, scope)` — write `latest.md` + `v<N>.md` for the next run's baseline.

A **finding** passed between caller and engine has this shape:

```
Finding = {
 id: "R<NNN>", // assigned by diff; provisional in scan order before that
 pass: string, // caller's pass label — e.g. "decision-integrity", "responsibility-overlap"
 locator: string, // the thing the finding is about: a proposal id, memory path, skill name, file:line
 verdict: string, // pass-specific tag — e.g. HOLDS / SUPERSEDED-unmarked / DEAD / OVERLAP
 severity: "Critical"|"High"|"Medium"|"Low",
 what: string, // one-line, specific
 route: "capture"|"memory-audit"|"proposal"|"direct-fix"|"none",
 proposed_action: string, // concrete — the capture content, the back-link edit, the proposal stub title
 status?: string, // open | applied | skipped | wont_fix:<reason> (set during route)
}
```

`route` is the load-bearing field: it names *which sibling organ fixes this*, so the engine never re-implements capture/memory-audit/review. A finding whose `route` is `none` is informational (surfaced, not actionable).

## Functions

### `orient(target)`

Mirrors review's Phase-1 orientation (§2c), generalised off code and onto whatever corpus the caller names.

**Input:** `target = { kind, roots, report_dir }`
- `kind` — `"decisions"` | `"system"` | `"conformance:<slug>"` (caller-defined; engine treats it as an opaque label for the orientation header and the report path).
- `roots` — the directories/files the corpus lives in (caller supplies; e.g. a `proposals/` directory, the memory tree, the skills tree).
- `report_dir` — where this kind's reports persist (e.g. `.claude/retrospects`, `.claude/system-reviews`).

**Steps:**
1. **Inventory.** Glob `roots`, count by type, note the largest/most-linked nodes. Cheap structural census — *not* a content read of every file (the passes read content).
2. **Since-last-run delta.** Read `<report_dir>/<scope>/latest.md` frontmatter if it exists; take its `date`. Compute what changed since:
 - git: `git log --oneline --since=<date>` over the relevant repo(s) → commits/ships in the window.
 - non-git or no baseline: fall back to file mtimes newer than the baseline date, or "first run — full corpus" when no baseline.
3. **Emit the orientation block** (goes in the report header, before findings):

```
## Orientation
Corpus: <kind> — <one-line census, e.g. "59 proposals, 38 memory files, 31 skills">
Since last run (<baseline date or "first run">): <N ships / M recaps / K skill changes in window>
Focus hint: <the nodes most likely to harbour drift — e.g. "supersedes chains touching 020/029/038; skills added since baseline">
```

The focus hint is the meta-review analogue of review's large×high-churn intersection: it points the caller's passes at where drift concentrates (recently-shipped proposals, recently-touched organs, the longest supersedes chains). When the corpus is too small or too new for a meaningful hint, say so explicitly rather than omitting the line.

Orientation is read-only and emits no findings of its own.

### `diff(findings, baselinePath)`

Identical model to review §4b, retargeted at meta-review findings.

1. If no `latest.md` at `baselinePath` → **Run mode = fresh**; assign IDs `R001…` in caller order; return.
2. Parse the baseline's findings table to `{id, pass, locator, what, status}`.
3. **Match** a new finding to a baseline finding when `pass` is identical **and** either: `locator` is the same node (same proposal id / memory path / skill name), or the `what` strings are near-identical (concept-level match for a finding whose locator moved).
4. **Tag:**
 - `CARRIED` — in baseline (open) and in this run; reuse the baseline id.
 - `NEW` — no baseline match; assign a fresh id continuing above the baseline max.
 - `WONT_FIX` — baseline-tagged `wont_fix` and still present; reuse id; suppress from Quick wins; list under "Carried as won't-fix" with the prior reason quoted.
 - `RESOLVED` — in baseline (open) with no match this run; list under "Resolved since last run" — never silently dropped (surfacing what closed is half the point).
5. Malformed baseline → log a one-line header warning, treat as fresh, leave the prior file untouched.

### `render(report)`

Render the report body per the [review output contract](../../docs/review-output-contract.md). The caller supplies findings + the orientation block; the engine produces:

- **Header** — corpus, files scanned, run mode, baseline.
- **Orientation block** (from `orient`).
- **Severity × Pass roll-up matrix** (the meta-review analogue of review's Severity × Category — rows are the caller's passes).
- **Mandatory diagram** — try mermaid, fall back to ASCII, only emit a one-line N/A *with a why* when the run genuinely has no structure to draw. Good defaults: a `supersedes`-chain graph for retrospect's decision-integrity findings; an organ-dependency / overlap graph for system-review.
- **Per-node findings**, grouped by `locator`, severity-sorted within each.
- **Findings table** — uncapped within the run ceiling, one row per finding with `Status` on repeat runs.
- **Quick wins** — Low-effort × Medium+-severity; explicit "None" line when empty.
- **"Things that look bad but are actually fine"** — structurally required, ≥2 near-misses with reasoning, or an explicit one-line justification when the scope is too narrow. (For meta-review this is high-value: it stops the organ from flagging a deliberate supersedes chain or an intentionally-thin organ as drift.)

When a finding needs a memory/proposal **body** shown inline, call [deliver](../deliver/SKILL.md) (`render_bodies`) rather than re-reading and pasting. The contract wins on any divergence — this section consumes it, does not redefine it.

### `route(finding)` — propose-confirm-commit with routing

Iterate findings in report order. For each, present it and offer:

- **Apply** → execute by `route`:
 - `capture` → invoke [capture (011)](../capture/SKILL.md) with `proposed_action` as candidate content. Capture classifies kind/scope/relevance and runs its own confirm. (Used for: uncaptured lessons, sharpened/added rules.)
 - `memory-audit` → the fix is a *mechanical* memory edit (e.g. add a missing `superseded_by` back-link, fix a broken relation). Apply it as a direct Edit framed as the memory-audit fix, or hand off to [memory-audit (024)](../memory-audit/SKILL.md) `--check` for the relevant dimension when the run surfaced several. retrospect-core never decides memory *validity* itself beyond the caller's verdict — it routes the integrity fix.
 - `proposal` → write a stub under the project's `proposals/` directory (next free slot or a `BACKLOG.md` row), titled from `proposed_action`, body = the finding + why. Never auto-fills a full proposal; it captures the candidate so it isn't lost. Confirm the slot number with the user first.
 - `direct-fix` → a self-evident edit the organ owns outright (e.g. an index line, a stale path in a coverage map). Edit, confirm.
- **Skip** → discard for this run (ephemeral; does not become next run's `wont_fix`).
- **Edit** → take the user's revised action; apply; loop.
- **View detail** → show the underlying node (proposal/memory/skill) via deliver or a direct read; re-prompt.
- **Won't fix (reason)** → durable one-line reason; tag `wont_fix:<reason>`; carries forward next run, suppressed from Quick wins.

No silent action — every finding is the user's decision. Two **caller-selectable** flows, both user-driven (neither auto-applies):

- **Per-finding loop** (default — `retrospect`, `review`, `memory-audit`): iterate findings in report order, confirm each (the loop above). Each decision is isolated.
- **Batch-select** (`checkpoint`): after `render` presents the whole batch, the caller collects the user's selected finding ids in **one** prompt, then calls `route` over only that subset. Fewer conversational round-trips (the efficiency *conversations* axis); still no silent apply — the user picked the set. Unselected findings persist for the next run, not lost.

### `persist(report, scope)`

Write the run to `<report_dir>/<scope-slug>/`, same versioning + atomicity as review §7b:

- Slug from the caller's scope (`decisions`, `system`, `<feature-slug>` for conformance).
- If `latest.md` exists → rename to `v<N>.md` (highest+1); write the new run as both `v<N+1>.md` and `latest.md`; set `supersedes: v<N>.md` in the new frontmatter.
- Atomic order: write `v<N+1>.md`, rename old `latest.md`→`v<N>.md`, copy `v<N+1>.md`→`latest.md`. On failure leave the tree as-is and report in the run summary; never partially overwrite.
- Frontmatter carries `date`, `kind`, `scope_slug`, `run_mode`, `baseline`, `findings_total`, per-severity counts, and per-finding `Status` in the table (the next run's `diff` reads these).

The artefact is committable — diffing `v3.md`↔`v4.md` shows which decisions went stale, which organs got consolidated, what reopened.

## What retrospect-core does NOT do

- **Does not produce findings.** The passes (caller-owned) do. The engine orients, diffs, renders, routes, persists.
- **Does not fix anything itself beyond `direct-fix` index/path edits.** Lessons → capture; integrity fixes → memory-audit; system changes → proposals. It routes; siblings fix.
- **Does not auto-fire and has no command.** Library-only, like deliver.
- **Does not re-read or re-filter** what the caller passed — findings are taken as the caller produced them (the engine only tags them via `diff`).
- **Does not redefine the output contract.** It consumes [042](../../docs/review-output-contract.md); on divergence the contract wins.
- **Does not span projects in one call.** One corpus, one report dir, per invocation.

## Relationship to other organs

- **deliver (012)** — called to render memory/proposal bodies inside reports. Same library-only posture.
- **review (005)** — the donor of the orient/diff/persist machinery; this is that machinery extracted and generalised off code. review keeps its own copy inlined (it predates this) — a future refactor could point review here too, but that is not in 060's scope.
- **capture (011) / memory-audit (024)** — the two routing targets for lessons and memory-integrity fixes respectively.
- **retrospect / system-review** — the two consumers. They own corpus + passes; they delegate the spine here.

See the design notes for the charter boundaries this engine enforces.
