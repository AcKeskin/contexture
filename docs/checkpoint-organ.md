# Checkpoint — scope-dialed fit-and-intent

Authoritative procedure: [`skills/checkpoint/SKILL.md`](../skills/checkpoint/SKILL.md); this doc is the Claude-facing reference.

## What it is

One lens — *does this serve the original point, cohere with the whole, and what did I learn?* — delivered at **three zoom levels**, governed by the efficiency-helper principle (one verb, no altitude gaps, batch findings). It is the missing middle and the missing lens: today's diff reviewers (`review`, `pr-review`, `code-review`) judge a change *in isolation*; the backward-looking organs audit the *whole* by governance category. checkpoint asks fit-and-intent at whatever zoom you're at.

It **absorbs** `retrospect` + `system-review` — now **deprecated** (kept and functional until checkpoint is proven, then retire). `memory-audit` (mechanical integrity) and `recap` (per-session episodic) stay separate lenses. Delegates orient/diff/render/route/persist to [`retrospect-core`](../skills/retrospect-core/SKILL.md).

## Scope resolution

Auto-detect from what it's pointed at, with `--scope` override; the resolved scope is surfaced in the report header so it's correctable.

| Signal | Scope | |---|---| | a diff / PR / `--since` ref | **diff** | | a just-built / named module (the session's recently-edited subtrees) | **module** | | no specific target | **corpus** | | ambiguous | ask once / honor `--scope` | ## The lens at each scope

- **diff** — composes: invokes `/code-review` (correctness) **and** adds a fit-pass ("does this change serve the intent + cohere with the whole"). One report, two sections. (Falls back to fit-only if code-review is unavailable.)
- **module** — the post-build checkpoint over the just-built module(s): **drift** (vs intent), **integration-fit** (do the pieces cohere — the novel blade nothing else checks), **continue-or-kill**, **lessons**.
- **corpus** — the history + organ-surface audit (the absorbed `retrospect` + `system-review` passes) via `retrospect-core`.

## Findings flow — batch, then apply selected

Renders the whole batch (042 contract: Severity × Pass matrix, mandatory diagram, "looks bad but fine" section), then asks the user to **pick which findings to apply in one pass** (not a per-finding loop — the efficiency *conversations* axis). Selected findings route via `/capture` / `/memory-audit` / a `proposals/` stub / a direct edit. Unselected persist for next time. Baseline at `.claude/checkpoints/<scope-slug>/latest.md`.

## What checkpoint is not

- Does not auto-fire; does not fix in place (routes); does not duplicate `code-review` (composes it at diff scope); does not absorb `memory-audit`/`recap`; does not re-implement the engine; does not delete `retrospect`/`system-review` yet (deprecate-then-retire).

## Relationship to other organs

- **retrospect-core** — the shared engine (+ the batch-select route mode this organ added). **retrospect / system-review** — deprecated; checkpoint's corpus scope runs their passes. **code-review** — composed at diff scope. **capture / memory-audit / proposals** — routing targets. **review / pr-review** — the other diff reviewers; checkpoint adds the fit lens, doesn't replace them.
