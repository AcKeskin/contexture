# checkpoint — corpus-scope passes

The pass definitions for `/checkpoint --scope corpus`. The engine (orient / diff / render / route / persist) is [retrospect-core](../retrospect-core/SKILL.md); these are the caller-owned passes it runs. Two corpora, eight passes, one report. Every pass emits `Finding` objects per the retrospect-core shape (`pass`, `locator`, `verdict`, `severity`, `what`, `route`, `proposed_action`).

## Orient targets

Call `retrospect-core.orient` once per corpus in scope; state in the report header which corpora ran.

- **Decision & delivery corpus** — `kind: "decisions"`; roots: the project's `proposals/` dir (+ `BACKLOG.md`), the memory tree's `decisions/` + `lessons/` + `warnings/` + `sessions/`, and the ship records (the project's ship-narrative record, if it keeps one, and `CHANGELOG.md`). `report_dir: .claude/retrospects`.
- **Organ-surface corpus** — `kind: "system"`; roots: `skills/`, `commands/`, `agents/`, `hooks/`, `architectural-rules/`, `mcps/` of the config repo; the coherence yardstick is `.claude/visions/default/v1.md`. `report_dir: .claude/system-reviews`.

Use the focus hint (longest `supersedes` chains, proposals shipped since baseline, organs added/changed since baseline) to prioritise; on a full first run, cap at the nodes actually at risk and note the cap in the header.

## Decision & delivery passes

### D1 — Decision integrity

For each `kind: decision` memory and each shipped proposal's load-bearing choice, assign a verdict:

- **`HOLDS`** — still true, consistent with what shipped. Counted, not listed.
- **`SUPERSEDED-unmarked`** — a later proposal/decision replaced it but the supersession was never recorded (missing `superseded_by`, or the proposal index still presents it as live). → `route: memory-audit` (back-link) or `direct-fix` (index status line). Cross-check `supersedes`/`superseded_by` chains against what the proposals actually did.
- **`CONTRADICTED`** — two live decisions disagree, neither supersedes the other. → `route: capture` (a `relations: contradicts` pair), severity High.
- **`STALE`** — the decision references an artefact that no longer exists or whose status changed materially. → `route: memory-audit` (reference fix) or `capture` (re-statement).

memory-audit asks "is the back-link present?"; this pass asks "*should* this be superseded?" — the validity judgment memory-audit deliberately omits. Mechanical fixes route there.

### D2 — Intent-vs-shipped

For each proposal marked shipped: read its ship note / amendments against its original done-criteria. Flag **`DRIFTED`** when the ship deviated in a way never reconciled into the proposal body, or when stated done-criteria don't all show as met. → `route: proposal` (amendment stub) or `capture` (lesson), severity Medium. Signal: ship notes saying "redesigned at ship time", "reversed", "deferred to v2" with no reflecting edit.

### D3 — Uncaptured lessons

Sweep every `sessions/` recap since the last run for `Learned` items never promoted to a rule-tier memory (token-overlap check against the tree). No match → `route: capture`, `proposed_action` = the lesson text, severity Low–Medium. Never promotes silently — each routes through capture's confirm.

### D4 — Consolidation candidates

Over proposals + coverage map + backlog: flag drafted proposals overtaken by a later ship, rows describing work that's done or moot, and framings the corpus has outgrown. → `route: proposal` (consolidation/drop stub) or `direct-fix` (row edit), severity Low–Medium.

## Organ-surface passes

### O1 — Responsibility overlap

Read each organ's `name` + `description` (and boundary sections where ambiguous). Flag pairs whose jobs blur: overlapping triggers or outputs, or a skill and an agent doing the same job with no stated boundary. → `verdict: OVERLAP`, severity Medium–High, `route: proposal` (boundary/merge stub) or `direct-fix` (a one-paragraph boundary note).

### O2 — Dead / unused config

- Command shim whose target skill doesn't exist → `DEAD`, `route: direct-fix`, High.
- User-facing skill (description implies a `/x` trigger) with no shim → `GAP`, `route: direct-fix`. Distinguish intentional library-only skills.
- Orphaned hook / settings key pointing at a missing hook → `DEAD`, `direct-fix` or `proposal`.
- Agent / rule scope with no churn and no referencing organ → `DEAD-candidate`, severity Low, `route: none` (surface for judgment).

### O3 — Pipeline gaps & redundancy

Map the organs onto the lifecycle pipeline (envision → spec → draft-plan → blueprint → execute → close-out; prep/discover/deliver substrate; the backward-looking set). Flag stages the pipeline implies but no organ fills, and the same *mechanism* implemented twice where it should be shared. → `route: proposal`, Medium.

### O4 — Coherence vs vision

Read `.claude/visions/default/v1.md`. Organ cluster with no vision/proposal lineage → `UNTRACED`, `route: capture` or `proposal`, Low–Medium. Vision module with no organ serving it → `UNSERVED-MODULE`, `route: proposal`, Medium. Vision absent → skip with a header note.

## Slug conformance (sub-mode)

`/checkpoint --scope corpus <slug>` narrows to one feature's chain: locate `.claude/visions/<slug>/`, the active spec version, `.claude/plans/<slug>/`, the matching proposal, and the shipped commits. For each spec requirement / done-criterion: **`MET` / `PARTIAL` / `MISSING` / `EXTRA`** (EXTRA = shipped but never specced — scope creep), citing the clause and the shipping evidence. For each plan step: landed as planned / silently changed / dropped. `MISSING`/`PARTIAL` of a still-wanted clause → `route: proposal` or surface; `EXTRA` → `route: capture` or accept. Report scope-slug = the feature slug.

## Guard notes

- **Dead-config is a candidate, never a verdict.** There is no runtime invocation log; "unused" is inferred from churn + cross-references. A library-only skill has no shim by design; a relevance-gated rule scope may correctly be cold for months. Never remove an organ on churn signal alone.
- **Overlap is often intentional.** Adjacent organs with a *stated* boundary are correct. Flag overlap only when the boundary is absent or contradicted; put legitimate adjacencies in "looks bad but actually fine".
- **A pass with zero findings is a result, not an omission** — report it explicitly.
- **Report shape**: the mandatory diagram defaults to a `supersedes`-chain graph (decision findings) or an organ-dependency/overlap graph (surface findings).
