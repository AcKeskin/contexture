---
name: retrospect
description: "[DEPRECATED → use /checkpoint --scope corpus] Step back over the body of shipped work — proposals, decisions, ship records, recaps — and surface what no longer coheres (decision integrity, intent-vs-shipped drift, uncaptured lessons, consolidation). Routes fixes to /capture, /memory-audit, or a proposal stub; never fixes in place. /retrospect [slug | --since <ref>]. Never auto-fires."
deprecated: true
---

# retrospect

> **Deprecated.** Superseded by `/checkpoint --scope corpus`, which runs these same passes through the shared `retrospect-core` engine. Kept present and fully functional until `/checkpoint` is proven in real use, then retires — new work should reach for `/checkpoint`.

The decision & delivery retrospective organ. Implements the Lens-A half of. Runs the four decision/delivery passes over the project's own record; delegates orientation, baseline-diff, rendering, routing, and persistence to [retrospect-core](../retrospect-core/SKILL.md).

**Where it sits.** Every other backward-looking organ points at a narrow target — `review` at code, `pr-review` at one diff, `memory-audit` at memory-file *integrity*, `recap` at *one session*. retrospect is the macro layer above them: it reviews the **body** of decisions and delivery for *validity drift* across many ships, and it routes the fixes it finds back into those narrower organs. It is the automation of the manual "drop pass" the backlog reaches for by hand.

**The boundary that defines it** (see also the charter notes in [recap](../recap/SKILL.md) and [memory-audit](../memory-audit/SKILL.md)):
- `recap` owns **micro/episodic** — what happened today, what's next tomorrow. It *feeds* retrospect (recaps are an input corpus). retrospect does the cross-session consolidation a single recap structurally cannot.
- `memory-audit` owns **mechanical integrity** — orphans, broken relations, schema. retrospect owns **validity** — "is this decision still *true*?" — and routes the resulting mechanical fix (e.g. a missing `superseded_by`) *to* memory-audit.

## When to run

- User types `/retrospect`, `/retrospect <slug>`, or `/retrospect --since <ref>`.
- Natural language: "let's revisit what we've shipped", "are our decisions still holding", "do a retrospective", "what's drifted in the proposals", "did we build what we specced for X".
- **Do not auto-fire.** No session-end trigger, no hook, no schedule by default. Mode A, user-invoked. (A periodic "N ships since last retrospect" nudge is parked OQ3 until the natural cadence is observed.)

## Inputs

1. **Scope / mode argument** (optional) — see §1.
2. **The decision & delivery corpus:**
 - The project's **proposal / delivery-record corpus** — a `proposals/` directory (coverage map + `BACKLOG.md`) or equivalent, wherever the project tracks shipped work. The authoritative delivery record.
 - The **memory tree** `~/.claude/projects/<slug>/memory/` — specifically `decisions/`, plus `lessons/` and `warnings/` for the integrity cross-checks, and `sessions/` for the uncaptured-lessons sweep. Resolve the slug as [discover](../discover/SKILL.md) does (Glob `~/.claude/projects/*/memory/MEMORY.md`, match by project root).
 - **Ship records** — the `build_progress` project memory ("Recently shipped" / status lists) and `BACKLOG.md`'s "Recently shipped" section.
3. **Working directory / git** — anchors the corpus and enables `--since` + the since-last-run delta. Degrade gracefully without git.

## Procedure

### 1. Resolve scope / mode

| Form | Mode | Resolution | | --- | --- | --- | | `/retrospect` | full | All four passes over the whole decision & delivery corpus. Report scope-slug = `decisions`. | | `/retrospect <slug>` | conformance | The per-feature sub-mode (§5). `<slug>` is a feature slug with a spec/plan/proposal. Report scope-slug = the feature slug. | | `/retrospect --since <ref>` | full, windowed | Restrict passes to proposals/decisions/recaps touched since `<ref>` (git). Ephemeral — skips the persistent artefact, like review's `--since`. | `<slug>` vs `--since` is unambiguous (a slug never starts with `--`). If a bare word doesn't resolve to a known feature slug (no spec/plan/proposal under that name), ask whether the user meant a full retrospect filtered to that keyword.

### 2. Orient (delegate)

Call `retrospect-core.orient` with:

```
{ kind: "decisions",
 roots: [ "<proposals-dir>/", "<memory-root>/decisions/", "<memory-root>/sessions/", "<memory-root>/lessons/" ],
 report_dir: "<project-root>/.claude/retrospects" }
```

Use the returned **focus hint** to prioritise the passes — the longest `supersedes` chains, the proposals shipped since the baseline, the recaps written since the baseline. These are where validity drift concentrates.

### 3. Run the four passes

Each pass emits `Finding` objects per the retrospect-core shape (`pass`, `locator`, `verdict`, `severity`, `what`, `route`, `proposed_action`).

#### Pass 1 — Decision integrity

For each `kind: decision` memory **and** each shipped proposal's load-bearing choice (the decisions recorded in its ship note / amendments), assign a verdict:

- **`HOLDS`** — still true, still consistent with what shipped. (Not a finding; counted, not listed, unless the user asks for the full ledger.)
- **`SUPERSEDED-unmarked`** — a later proposal/decision replaced it, but the supersession was never recorded: the memory lacks `superseded_by`, or the proposal index still presents it as live. → `route: memory-audit` (add the back-link) **or** `route: direct-fix` (update the coverage-map status line). Cross-check the `supersedes` / `superseded_by` chains in memory against what the proposals *actually did* — a decision that quietly replaced but whose memory never got the back-pointer is the canonical catch.
- **`CONTRADICTED`** — two live decisions disagree and neither supersedes the other. → `route: capture` (record a `relations: contradicts` pair so the conflict is flagged for reconciliation), severity High.
- **`STALE`** — the decision references an artefact (tool, path, proposal, plugin) that no longer exists or whose status changed materially. → `route: memory-audit` if it's a reference fix, `route: capture` if the decision itself needs re-statement.

This pass leans on memory-audit's dimension-3 (relations integrity) machinery but adds the **judgment** memory-audit deliberately omits: memory-audit asks "is the back-link present?"; retrospect asks "*should* this be superseded in the first place?" When the answer produces a mechanical edit, it routes there.

#### Pass 2 — Intent-vs-shipped

For each proposal marked `[shipped]`:
- Read its **ship note / amendments** and its original **done-criteria / "Ship criteria"** section.
- Flag **`DRIFTED`** when the ship deviated from the original spec in a way that was never reconciled into the proposal body, or when stated done-criteria don't all show as met (a partially-shipped proposal still flagged shipped). → `route: proposal` (an amendment stub) or `route: capture` (a lesson, if the drift taught something), severity Medium.
- The signal to look for: ship notes that say "redesigned at ship time", "reversed", "deferred to v2" without the coverage map / done-criteria reflecting it. These are real and frequent in this corpus (e.g. 049's PreCompact→SessionStart redesign, 020's v2→v3 reversal) — the pass confirms each was reconciled, and flags any that wasn't.

#### Pass 3 — Uncaptured lessons

Sweep **every** `sessions/` recap since the last retrospect (the since-last-run delta from §2; full corpus on first run) for `Learned` items that never got promoted to a rule-tier memory:
- For each `Learned` bullet, check whether an equivalent rule/lesson/warning memory exists (token-overlap against the memory tree, same heuristic as memory-audit dim-4).
- No match → finding, `route: capture`, `proposed_action` = the lesson text. severity Low–Medium.

This is recap's per-session promotion pass (§8) run *across all sessions at once* — it catches the lessons that slipped through because the user skipped promotion that day. retrospect does not promote silently; each routes through `route`'s confirm into capture.

#### Pass 4 — Consolidation candidates

Over the proposals + coverage map + backlog, flag what can now be retired, merged, or re-framed:
- Drafted proposals overtaken by a later ship (e.g. a deferred item a newer proposal subsumed).
- Coverage-map / backlog rows describing work that's actually done or moot.
- Decisions/proposals whose framing the corpus has outgrown (the "029 is reframed by the vision" kind of move, done deliberately instead of incidentally).
→ `route: proposal` (a consolidation/drop stub) or `route: direct-fix` (a coverage-map / backlog edit), severity Low–Medium.

### 4. Diff, render, report, route, persist (delegate)

1. `retrospect-core.diff(findings, "<project-root>/.claude/retrospects/decisions/latest.md")` → NEW/CARRIED/RESOLVED/WONT_FIX.
2. `retrospect-core.render(report)` → the 042-contract body. The mandatory diagram defaults to a **`supersedes`-chain graph** (decisions as nodes, supersession as edges, unmarked-but-should-be-superseded edges highlighted) — the clearest visual for decision drift.
3. Present the report. Then `retrospect-core.route` per finding (Apply routes to capture / memory-audit / proposal / direct-fix; Skip / Edit / View detail / Won't-fix as usual).
4. `retrospect-core.persist(report, "decisions")` — unless `--since` (ephemeral). The artefact at `.claude/retrospects/decisions/latest.md` is the next run's baseline.

### 5. Conformance sub-mode — `/retrospect <slug>`

The narrow per-feature check ('s altitude-#2, kept as a mode, not its own organ). Compares **vision → spec → plan → shipped** for one slug.

1. Locate the slug's artefacts: `.claude/visions/<slug>/`, `.claude/specs/<slug>/` (active version per `INDEX.md`), `.claude/plans/<slug>/`, the matching `proposals/NNN-*.md`, and the shipped code/commits.
2. **Spec-clause conformance.** For each requirement / done-criterion in the active spec → `MET` / `PARTIAL` / `MISSING` / `EXTRA` (EXTRA = shipped but never specced — scope creep). Cite the spec clause and the shipping evidence (commit, file, or ship note).
3. **Plan-step conformance.** Each plan step's verification criteria vs the actual diff — which steps landed as planned, which silently changed, which were dropped.
4. Findings route: `MISSING`/`PARTIAL` of a still-wanted clause → `route: proposal` (a follow-up) or surfaced for the user to decide; `EXTRA` → `route: capture` (record the scope decision) or accept. Render + persist under scope-slug = `<slug>`.

The conformance report uses the same retrospect-core spine; the only difference is the corpus (one slug's artefacts) and the verdict vocabulary (`MET/PARTIAL/MISSING/EXTRA` instead of the integrity verbs).

## Failure modes

- **No baseline (first run).** retrospect-core reports Run mode = fresh; every finding is NEW. Expected on the first `/retrospect`.
- **Corpus too large** (every proposal + every decision). The since-last-run delta is the default narrower — on a full first run, prioritise by the focus hint and cap Pass-1 at the decisions actually at risk (supersedes chains + recently-shipped), noting the cap in the header. Offer `--since` for a windowed run.
- **No memory tree / no proposals dir.** Run the passes that have a corpus; report the missing one in the header. Decision-integrity needs `decisions/`; intent-vs-shipped needs `proposals/`; either can run without the other.
- **Git absent.** Since-last-run delta falls back to mtimes; `--since` refused with a clear message.
- **A pass produces zero findings.** Report it explicitly (`Decision integrity: N decisions, all HOLD`) — a clean pass is a result, not an omission.

## What retrospect does NOT do

- **Does not auto-fire.** Mode A, user-invoked. No hook, no session-end trigger, no default schedule.
- **Does not fix in place.** It routes — lessons → capture, integrity fixes → memory-audit, system changes → a proposals stub, self-evident index/path edits → direct-fix. It never silently rewrites a decision or a proposal.
- **Does not duplicate memory-audit.** Mechanical integrity (orphans, schema, broken links) stays memory-audit's; retrospect owns *validity* and hands the mechanical fix over. When a run surfaces many integrity issues, it points the user at `/memory-audit` rather than re-running those dimensions.
- **Does not duplicate recap.** recap is one session; retrospect is across many. recap feeds it. retrospect never writes a session recap.
- **Does not review code.** That's `/review`. retrospect reviews the *record of decisions and delivery*, not the implementation (except the conformance sub-mode's spec→ship evidence check, which reads ship notes/commits, not code quality).
- **Does not promote lessons silently.** Every uncaptured-lesson finding routes through capture's own confirm.

## Relationship to other organs

- **retrospect-core** — the shared engine; owns orient/diff/render/route/persist.
- **recap (013)** — the feeder. recaps are an input corpus (Pass 3); retrospect is the cross-session aggregator recap can't be.
- **memory-audit (024)** — the integrity sibling; retrospect routes decision-integrity *fixes* to it and defers to it on all mechanical checks.
- **capture (011)** — the route for uncaptured lessons, contradiction pairs, and re-stated decisions.
- **review (005)** — the code counterpart; same propose-confirm-commit shape, same 042 output contract, different corpus.
- **the project's proposals / backlog** — both an input (the delivery record) and an output route (consolidation/amendment stubs).

See the design notes for the boundary rationale and the open questions.
