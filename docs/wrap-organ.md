# Wrap — the session-terminus driver

Authoritative procedure: [`skills/wrap/SKILL.md`](../skills/wrap/SKILL.md); this doc is the Claude-facing reference for the closing loop as a flow.

## What it is

The forward chain (`envision → spec → draft-plan → blueprint → execute`, documented in [plan-execute-workflow](plan-execute-workflow.md)) authors a feature up to *running* the plan. The **closing** side of a session was a scatter of separate organs — `recap`, `close-out`, `update-changelog`, `capture`, `coordinate` teardown — each good on its own but each a manual invocation the user had to remember in the right order with the right dedup. `/wrap` is the **sequencer** for that closing ceremony.

It is a **driver, not a new organ**: it calls the existing organs in order and adds only the connective tissue — the sequence, the dedup, the autonomy-posture read, the BACKLOG-shipped-row sweep, and a build_progress offer. It never reimplements recap/close-out/changelog logic.

## The closing loop

`/wrap` runs these steps in order; each is conditional and skipped silently when it doesn't apply:

1. **Coordinate teardown** — tear down this session's board row (gitignored/ephemeral; routine-reversible, auto).
2. **Checkpoint** *(optional)* — a fit-and-intent pass when the session built a module/corpus-scope change; analysis auto, findings gated. Its reconcile must not double-run against step 4's.
3. **Recap** — invoked with the `--under-wrap` signal so it suppresses its own close/changelog doorways (`/wrap` owns those). Gather + draft auto; the file write, promotion-to-capture, and scoreboard write stay gated.
4. **Close-out `<slug>`** *(only if a slug shipped)* — reconcile the spec + retire artefacts + record the ship line. Fully gated.
5. **Update-changelog** *(only if a non-slug ship happened and step 4 did not run)* — the one changelog writer, called directly.
6. **BACKLOG-shipped-row sweep** — detect rows whose unit already shipped (cross-referenced against the changelog + the close-out archive) and propose their retirement. Detection auto, removal gated. Closes the gap where a unit shipped without a changelog line orphans its backlog row.
7. **build_progress offer** — offer a gated narrative-ledger update on a real ship.

**The dedup that matters:** close-out already invokes update-changelog as its record step. So when step 4 runs for a slug, step 5 does **not** separately offer the changelog for it — close-out is the superset.

## The gate — auto vs. stop

The write-class line governs the whole ceremony: **routine-reversible steps run without a per-step confirm** (coordinate teardown, reading git/state, drafting the recap, detecting shipped slugs/rows, reading the autonomy contract), while **every canonical write passes accept/edit/reject** — the recap file, the promotion capture, the scoreboard, the spec reconcile, the artefact move, the changelog line, the backlog-row removal, the build_progress edit. Automatic here means auto-*propose*, never silent-write.

`/wrap` reads the autonomy contract's `ask` field **once at entry** and threads the posture to every step: `forks-only` runs the reversible spine uninterrupted; `every-step` reverts the whole ceremony to per-step confirmation (it only ever *adds* confirmation — it never converts a canonical write into an auto-write).

## Auto-fire (opt-in, off by default)

`/wrap` is manual by default. An optional `SessionStart[clear|compact]` recovery hook (`wrap-terminus-recovery`, shipped **off**) can *propose* it: at the next session start it scans the prior transcript for a shipped/closed unit whose terminus never ran, and if found surfaces the `/wrap` proposal. It surfaces at the *next* start because `SessionEnd`/`PreCompact` output cannot reach the model — the same constraint the clear-context guard works around. Enable it by setting the `wrapTerminus` bundle `true` in `~/.claude/hook-config.json`.

## What wrap is not

- Not a new closing organ — a driver over recap / close-out / update-changelog / capture / coordinate.
- Not silent-write — every canonical write is gated; auto means auto-propose.
- Not on by default — the auto-fire hook ships disabled; the manual `/wrap` needs no hook.
- Not a Stop/SessionEnd hook — auto-fire is SessionStart-recovery only.
- Not a double-offerer — when close-out runs, the changelog step and its re-offer are suppressed.

## Relationship to other organs

- **recap** — invoked under `--under-wrap` so it suppresses its close/changelog doorways (standalone `/recap` keeps them). recap is a step of `/wrap`, not the reverse.
- **close-out** — the slug-close step; it contains the changelog write, so it dedups the changelog step.
- **update-changelog** — the changelog step for a non-slug ship when close-out didn't run.
- **checkpoint** — the optional fit-pass step; also a reader of the autonomy contract.
- **coordinate** — its teardown is the first step; coordinate's own auto mode shares `/wrap`'s SessionStart hook home.
- **autonomize** — the contract `/wrap` reads once to set the interrupt posture.
