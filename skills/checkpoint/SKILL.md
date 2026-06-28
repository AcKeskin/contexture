---
name: checkpoint
description: Scope-dialed fit-and-intent checkpoint — audits "does this serve the original point + cohere with the whole + what did I learn?" at diff / module / corpus zoom. Auto-detects scope (a diff/PR → diff; just-built module(s) → module; whole history → corpus) with a --scope override. At diff scope it composes /code-review (correctness) + a fit-pass. Batches findings and routes them to /capture / /memory-audit / a proposal. Use on /checkpoint [--scope diff|module|corpus], "does this fit", "did I drift from the point", "step back on what I built". Never auto-fires.
---

# checkpoint

The scope-dialed fit-and-intent organ. One lens — *does this serve the original point, cohere with the whole, and what did I learn?* — delivered at three zoom levels, governed by [[config-efficient-helper-for-competent-engineer]] (one verb, no altitude gaps, batch findings). Delegates orientation, baseline-diff, rendering, routing, and persistence to [retrospect-core](../retrospect-core/SKILL.md).

**Where it sits.** Today's diff reviewers (`review` rule-drift, `pr-review` an incoming PR, `code-review` correctness) judge a change *in isolation*; the backward-looking organs (`retrospect`, `system-review`) audit the *whole* by governance category. checkpoint is the missing middle and the missing lens: it asks **fit-and-intent at whatever zoom you're at.** It is the front door that **absorbs `retrospect` + `system-review`** (now [deprecated](#deprecation--absorb-gradually), kept until checkpoint is proven). `memory-audit` (mechanical integrity) and `recap` (per-session episodic) stay separate lenses.

## When to run

- `/checkpoint` — auto-detect the scope (below) and audit at that zoom.
- `/checkpoint --scope diff|module|corpus` — force the zoom.
- Natural language: "does this change fit the bigger picture", "did I drift from what I wanted", "do these modules I just built actually fit together", "step back on what we shipped".
- **Do not auto-fire.** Mode A, user-invoked. No hook, no session-end trigger.

## 1. Resolve scope

Auto-detect from what checkpoint is pointed at; surface the resolved scope in the report header so it's transparent and correctable. `--scope` always overrides.

| Signal | Scope | |---|---| | A diff / PR / `--since <ref>` in play, or a single change unit | **diff** | | A just-built module or named module path(s) — the session's recently-edited subtree(s) | **module** | | No specific target / "step back on the project / decisions / organs" | **corpus** | | Ambiguous (could be two scopes) | ask once, or honor `--scope` | "Just-built" for **module** scope = the modules touched since the last commit (or this session's Edit/Write targets), grouped by top-level subtree. State which modules it resolved so the user can correct.

## 2. The lens at each scope

Every scope produces `Finding` objects per the [retrospect-core](../retrospect-core/SKILL.md) shape (`pass`, `locator`, `verdict`, `severity`, `what`, `route`, `proposed_action`).

### diff scope — fit on a change (compose, don't duplicate)

1. **Correctness (compose).** Invoke `code-review` on the change for bugs + cleanup. If `code-review` is unavailable, note it and proceed with the fit-pass only.
2. **Fit-pass (the added lens).** Read the slug's intent (vision/spec if present) + the surrounding architecture (codemap, the touched module's boundaries). Ask: *does this change serve where we're going, and cohere with the whole* — not just "is it locally correct". Findings: scope creep, a change that contradicts the stated intent, a boundary it quietly crosses, a simpler shape that fits better.
 - **Size the fit question to the autonomy contract's `stopping` posture** ([autonomize](../autonomize/SKILL.md), — read the effective contract): under **`criteria-met`** (default), ask the full fit question above *plus* gold-plating (any finished item tracing to no stated criterion?). Under **`user-anytime`**, do not flag "more could be done" as drift — the posture is freeze-a-coherent-best-so-far and record what remains; the fit question becomes *is what's here coherent and honestly scoped*, not *is it complete*. Under **`diminishing-returns`** / **`budget`**, treat "stopped before perfect" as intended, not a finding. The contract selects which fit question to ask; checkpoint does not redefine fit.
3. Render **one report, two sections** (correctness from `code-review` + fit from the fit-pass). One action, both lenses.

### module scope — the post-build checkpoint (the core need)

Over the just-built module(s), four passes:
- **Drift** — does the built work still serve the original point (vision/spec intent)? Flag where the implementation wandered from what was asked.
- **Integration-fit** — *the sharpest blade:* do the just-built modules actually **cohere with each other** — consistent boundaries, assumptions, and seams — or did they drift apart while built heads-down? Nothing else in the system checks this.
- **Continue-or-kill** — now that it's real, is the direction still worth it, or did building reveal it's not?
- **Lessons** — what did building this teach (capture-worthy)? Routes to `/capture`.

When a module-scope checkpoint confirms a built unit is **good and worth keeping** (drift clean, coheres, continue), offer a changelog ship line: *"&lt;unit&gt; checks out — log it to CHANGELOG? (y/N)"*. On `y`, invoke [`skills/update-changelog/SKILL.md`](../update-changelog/SKILL.md) with the unit — it composes a ship line behind its own accept/edit/reject gate. checkpoint is a *doorway*, not the changelog writer. Skip when the checkpoint kills/defers the work (nothing shipped to log).

### corpus scope — the history + system audit (absorbed)

Delegates to the existing `retrospect` passes (decision integrity, intent-vs-shipped, uncaptured lessons, consolidation) and `system-review` passes (organ overlap, dead config, pipeline gaps, vision drift), run through `retrospect-core` — the engine they already share. checkpoint is the front door; the deprecated organs stay callable during the transition.

## 3. Findings flow — batch, then apply selected

1. `retrospect-core.orient` + the scope's passes → findings.
2. `retrospect-core.diff(findings, baseline)` → NEW/CARRIED/RESOLVED tagging (baseline at `.claude/checkpoints/<scope-slug>/latest.md`).
3. `retrospect-core.render(report)` → the 042-contract **batch report**: header (with the resolved scope), the findings, a Severity × Pass matrix, the mandatory diagram, the structurally-required "looks bad but actually fine" section.
4. **Select, don't loop.** Present the whole batch, then ask the user to **pick which findings to apply/route** in one pass (e.g. *"apply 1,3,4 / all / none / show <id>"*) — not a per-finding confirm sequence. This is the efficiency "conversations" axis: one round-trip, not N.
5. `retrospect-core.route` on the **selected set only** — each routes by its `route` (capture / memory-audit / proposal / direct-fix). Unselected findings stay in the persisted report for next time.
6. `retrospect-core.persist(report, scope-slug)` — the next run's baseline.

## Deprecation — absorb gradually

`retrospect` and `system-review` are **deprecated, not deleted** ('s "absorb gradually"): their SKILL.md frontmatter carries `deprecated: true` and a "use `/checkpoint --scope corpus`" note, and they remain fully functional. They retire only once `/checkpoint` is proven in real use. Until then checkpoint is the **primary** surface and they are the **fallback** — one depends on the other's engine (`retrospect-core`), so the two surfaces can't silently diverge ([[parallel-surfaces-drift-need-primary-fallback]]).

## What checkpoint does NOT do

- **Does not auto-fire.** Mode A, user-invoked.
- **Does not fix in place.** It routes — lessons → `/capture`, integrity fixes → `/memory-audit`, system/decision changes → a `proposals/` stub, self-evident edits → direct-fix. Never silently rewrites.
- **Does not duplicate `code-review`.** At diff scope it *invokes* it for correctness and adds the fit lens; the lenses stay distinct.
- **Does not absorb `memory-audit` or `recap`.** Mechanical integrity and per-session episodic are different lenses; both stay separate (recap *feeds* the corpus scope).
- **Does not re-implement the engine.** orient / diff / render / route / persist are `retrospect-core`'s.
- **Does not delete `retrospect` / `system-review` yet.** Deprecate-then-retire, not delete-now.

## Relationship to other organs

- **retrospect-core** — the shared engine (orient/diff/render/route/persist + the batch-select render/route mode this organ uses).
- **retrospect / system-review** — deprecated; checkpoint's corpus scope runs their passes via the shared engine.
- **code-review** — composed at diff scope for the correctness lens.
- **capture / memory-audit / proposals** — the routing targets.
- **recap** — the per-session feeder to the corpus scope (unchanged).
- **review / pr-review** — the other diff reviewers (rule-drift / incoming-PR); checkpoint adds the fit-and-intent lens, it does not replace them.

See `.claude/specs/checkpoint/v1.md` for the design, the resolved forks, and the done-criteria.
