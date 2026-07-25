---
name: wrap
description: "Session-terminus driver — one /wrap runs the closing ceremony in order (coordinate teardown → checkpoint if warranted → recap → close-out → changelog → backlog sweep → build progress), driving the existing organs. Auto-runs the reversible spine; every canonical write gated accept/edit/reject. Use on /wrap or \"wrap up the session\". Mode A — never auto-fires."
---

# wrap

The session-**terminus driver**. The closing organs — `recap`, `close-out`, `update-changelog`, `capture`, plus `coordinate` teardown — each exist and are individually good, but nothing sequences them and nothing fires them on its own, so the closing ceremony is several manual invocations the user must remember in the right order with the right dedup. `/wrap` is that sequencer.

It is a **driver, not a new organ**: it calls the existing organs in order and adds only the missing connective tissue (the sequence, the dedup, the autonomy-posture read, the BACKLOG-shipped-row sweep, the ship-narrative-record offer). If it reimplements recap/close-out/changelog logic, it is wrong.

Governed by the autonomy write-class line: automate the reversible read/draft/detect spine, keep the accept/edit/reject gate on every canonical write. Same pattern as `capture`'s auto-propose-never-write and `prep`'s auto-fire-read-only.

**Where it sits.** The forward chain (`envision → spec → draft-plan → blueprint → execute`) is complete; `/close-out` closes a *shipped slug*; `/update-changelog` is the one changelog writer; `recap` records the *session*. `/wrap` sits above all of them as the *session-close orchestrator* — it decides which of them the session earned and runs them in one pass. `checkpoint --scope corpus` audits coherence; `/wrap` closes the session.

## When to run

- User types `/wrap` (explicit trigger).
- User says "wrap up the session", "close this out", "run the closing steps", "end-of-session".
- **The optional auto-fire (opt-in, `enabled:false` by default):** a `SessionStart[clear|compact]` recovery hook (`SessionEnd`/`PreCompact` cannot surface — their stdout is debug-only) reads the *prior* session's transcript at the next start and, on an in-context judgment that the prior session shipped or closed work whose terminus was never run, **proposes** `/wrap`. It never auto-runs the ceremony — it surfaces the proposal, the user invokes.
- **Otherwise never auto-fires.** Mode A. Every canonical write inside the ceremony passes its own accept/edit/reject gate.

## The interrupt posture — read the autonomy contract once

At entry, resolve the effective autonomy contract **once** (per [autonomize](../autonomize/SKILL.md): `live > kickoff > inferred > default > implicit-default`) and read its `ask` field. Pass the resolved posture down to the sub-steps — the sub-organs do **not** each re-read it, so the whole ceremony runs at one consistent posture:

- **`forks-only`** (the default) — run the reversible spine (coordinate teardown, gather/draft/detect) without per-step confirmation; stop only at the canonical-write gates and real forks.
- **`every-step`** — confirm each consequential step; the whole ceremony reverts to per-step propose-confirm (the posture for a user who wants it tightly supervised).
- **`until-blocked`** — run the reversible spine and surface the canonical-write proposals without pausing between steps, stopping only when genuinely blocked.

The contract sets the *interrupt cadence*; it never converts a canonical write into an auto-write (§ the gate below). If no contract resolves, fall back to `forks-only`.

## The gate — what auto-runs vs what stops

Per the autonomy write-class line:

- **Routine-reversible → auto** (no per-step confirm under `forks-only`): the coordinate `done` teardown (ephemeral board), reading the session's git/state, drafting the recap body, detecting a shipped slug, detecting shipped BACKLOG rows, reading the autonomy contract, the scratch read/reconcile/dedup pass and its post-promotion clear (session-scoped, disposable, already TTL-bound).
- **Canonical-write → gated** (accept/edit/reject, always, regardless of contract — `every-step` only *adds* confirmation, never removes it): the recap file write, the promotion→capture, the **scratch promotion→capture**, the MEMORY.md scoreboard write, the spec reconcile, the artefact move, the changelog line, the BACKLOG-row removal, the ship-narrative-record edit.

## Procedure

Run the ceremony in this order. Each step is conditional — skip it when it doesn't apply, silently.

### 1. Coordinate teardown (routine-reversible — auto)

Invoke [`coordinate`](../coordinate/SKILL.md) `done` to tear down this session's board row (`.claude/sessions-active.md`, gitignored/ephemeral). This is a routine-reversible board write — under `forks-only` it runs without a confirm. Skip silently if no board / no row for this session. (Composes with coordinate's auto mode, which auto-registers the row at session start.)

### 2. Checkpoint (conditional; analysis auto, findings gated)

If the session built a **module- or corpus-scope** change (not a diff-scope tweak), offer [`checkpoint`](../checkpoint/SKILL.md) — "does what I built still fit + what did I learn?" Reuse checkpoint's own auto-scope detection to decide whether it's warranted; skip for a diff-scope tweak. Its analysis is read-only (auto); any findings route through checkpoint's own gate. **Do not** run a reconcile pass here that step 4's close-out will re-run on the same slug — checkpoint *detects*, close-out *acts*; running both reconciles on one slug is duplicate work.

### 2.5 Scratch reflection pass (read/dedup auto; promotion gated)

The session's scratch tier (written silently during work by [`execute`](../execute/SKILL.md) §3d.1 and [`checkpoint`](../checkpoint/SKILL.md) step 7) holds in-flight observations that are **deleted un-promoted at session end**. This is the one pass that can turn any of them into durable memory. It runs **before recap** so recap narrates a session whose promotions are already settled.

1. **Read + reconcile (auto).** Read this session's scratch and apply contradiction reconciliation — a later observation superseding an earlier one wins, so a corrected reading is never offered beside the stale one it replaced.
2. **Filter by salience (auto).** Drop `low`-salience entries from candidacy. Those are the passing-verification notes: real value *during* the session for re-orientation, near-zero value as durable memory. They are filtered from the candidate list, not deleted early.
3. **Dedup + merge (auto).** Collapse near-duplicates into one candidate. Several steps hitting the same seam should promote as one memory, not four.
4. **Present as ONE batch (gated).** Show the survivors as a single accept/edit/reject list — *"promote 1,3 / all / none / show &lt;id&gt;"* — the same select-don't-loop posture as checkpoint's findings flow. **Not** a per-candidate confirm sequence: per-fact prompting is the cost this tier exists to remove.
5. **Promote via capture (gated).** Accepted candidates go to [`capture`](../capture/SKILL.md), which owns durable authoring — frontmatter shape, secret redaction, MEMORY.md indexing. `/wrap` never writes a canonical memory itself. Rejected candidates are simply not promoted; they need no further action, since step 6 discards everything anyway.
6. **Clear the scratch (auto, after promotion resolves).** Un-promoted scratch is deleted — a wrong observation must not outlive the session that produced it. The clear reports how many entries were discarded, so a session that promoted nothing still says so out loud rather than silently dropping its accrual.

Skip the whole step silently when the session wrote no scratch. **Ordering is load-bearing:** the clear runs *after* promotion resolves, never before — an aborted or declined promotion must leave the entries readable, not consume them.

### 3. Recap (gather/draft auto; writes gated) — invoked with the under-wrap signal

Invoke [`recap`](../recap/SKILL.md) **with the `--under-wrap` signal** so it suppresses its own §7.4 close-out/changelog doorways — `/wrap` owns those offers (steps 4–5), and a double-offer is the parallel-surfaces-drift landmine (two surfaces of one contract diverge and mask each other). recap still runs its gather + draft (auto) and its §9 bloat nudge; its file write, promotion→capture, and scoreboard write stay gated.

### 4. Close-out (conditional — only if a slug shipped; fully gated)

If the session **shipped a slug** (a `.claude/specs/<slug>` + `.claude/plans/<slug>` whose done-criteria are met), invoke [`close-out`](../close-out/SKILL.md) `<slug>` — reconcile spec + retire artefacts + record the ship line. Fully gated (it moves files + edits the canonical spec).

**Dedup (load-bearing):** close-out's *record* step already invokes `update-changelog`. So when `/wrap` runs close-out, it **does not** separately run step 5 for that slug — close-out is the superset, not a second changelog offer.

### 5. Update-changelog (conditional — only if a non-slug ship AND close-out did not run)

If the session shipped a **non-slug unit of work** (a multi-organ change, a fix — something with no spec/plan to close out) **and** step 4 did not run for it, invoke [`update-changelog`](../update-changelog/SKILL.md) directly — compose the ship line (draft, auto), prepend it (gated). Skip silently if nothing shipped.

### 6. BACKLOG-shipped-row sweep (detect auto; removal gated)

Sweep `BACKLOG.md` for rows whose unit **already shipped** — cross-reference each row against `CHANGELOG.md` and the `.claude/archive/<date>-<slug>/` close-out folders. This closes the currently-unowned gap: a unit shipped without a changelog line orphans its BACKLOG row forever, and no other organ sweeps for that independent of a ship event. Detection is auto (a slug/unit-id match; model judgment only for ambiguous rows — never guess a row shipped); the **row removal is gated** (propose the retirement, accept/edit/reject). See the sweep detail in [`backlog-sweep.mjs`](./backlog-sweep.mjs) when the detection warrants a script. Skip silently if there's no `BACKLOG.md` in the project.

### 7. Ship-narrative-record offer (conditional — on a real ship; gated)

On a real ship, **offer** a gated update to the project's ship-narrative record (a build-progress memory or equivalent), if it keeps one — its narrative shipped-list: *"Log this ship to the ship-narrative record? (y/N)"*. It is a memory (canonical write) → propose-confirm, never auto-write. Skip silently when nothing shipped or the project keeps no such record.

### 8. Close

Report what ran: which steps fired, which were skipped, what's staged for the user's gates. Do not auto-commit anything. Do not re-offer close-out/changelog if step 4 already handled the slug.

## What wrap does NOT do

- **Not a new closing organ.** A driver over recap / close-out / update-changelog / capture / coordinate. It sequences and dedups them; it never reimplements their logic.
- **Not silent-write.** Every canonical write (recap file, capture, scoreboard, spec reconcile, artefact move, changelog line, BACKLOG-row removal, ship-narrative-record edit) passes accept/edit/reject. Auto = auto-*propose*.
- **Not on by default.** The auto-fire hook ships `enabled: false`; the manual `/wrap` works with no hook at all.
- **Not a Stop/SessionEnd hook.** `SessionEnd`/`PreCompact` stdout is debug-only and exit-2 blocks, so a non-blocking guard can't surface there; auto-fire is SessionStart-recovery only.
- **Not mid-session supervision.** No background watcher; the auto-fire judgment runs once, at the next SessionStart.
- **Not a double-offerer.** When close-out runs (step 4), the changelog (step 5) and its re-offer are suppressed — close-out contains the changelog write.

## Relationship to other organs

- **recap** — invoked at step 3 *with the `--under-wrap` signal* so it suppresses its §7.4 doorways (which `/wrap` owns). recap standalone keeps §7.4 unchanged.
- **close-out** — step 4 (only on a shipped slug); it contains the changelog write, so it dedups step 5.
- **update-changelog** — step 5 (only on a non-slug ship when close-out didn't run); the one changelog writer.
- **checkpoint** — optional step 2; it also reads the autonomy contract (the pattern `/wrap` extends to the whole ceremony). Its reconcile must not double-run against close-out's.
- **coordinate** — step 1 teardown; coordinate's auto mode registers the row at session start and shares `/wrap`'s SessionStart hook home.
- **capture** — recap's promotion pass routes here (gated); same auto-propose-never-write shape as the auto-fire.
- **autonomize** — the contract `/wrap` reads once at entry to set the interrupt posture.
- **clear-context guard** — the SessionStart-recovery hook pattern the auto-fire inherits (and the SessionEnd-can't-surface constraint).
- **prep** — the same all-read-only auto-fire-on-SessionStart pattern.
- **Governed by the autonomy write-class line** — automate the reversible spine, gate every canonical write.
