---
name: close-out
description: Close out the scope chain on a shipped slug — reconcile the shipped change back into the canonical spec, retire spent plan/blueprint/superseded-spec artefacts to a dated archive folder, and record one ship line. The terminus after /execute meets done-criteria, the counterpart to 026's done-criteria open. Use when the user types /close-out <slug>, says "close out this slug" / "reconcile what shipped" / "wrap up <slug>". Mode A — never auto-fires, never auto-writes (moves files + edits the canonical spec behind propose-confirm).
---

# close-out

The scope chain's **terminus**. The forward chain (`envision → spec → draft-plan → blueprint → execute`) authors versioned artefacts up to *running* the plan; it has no close. `/close-out <slug>` is that close — it runs **after** `/execute` confirms done-criteria met and does three things, in order:

1. **Reconcile** — make the slug's canonical spec say *how it behaves now*, not *what we planned*, preserving the original intent via the version chain.
2. **Retire** — move the spent working artefacts (plan, blueprint, superseded spec versions) to a dated archive folder. The reconciled spec stays live; the working set becomes audit history.
3. **Record** — emit **one** ship line to the canonical `CHANGELOG.md` (via [`update-changelog`](../update-changelog/SKILL.md)), instead of the hand-copy into three ledgers the corpus does today.

Governed by [[config-efficient-helper-for-competent-engineer]]: collapse the "what's true now / what shipped" scatter across spec / proposal / three ledgers / git into one reconcile-and-record act — leverage, not ceremony.

**Where it sits.** `026` opens the boundary (done-criteria, "what done means"); `/close-out` closes it ("done, here's the now-current spec, the working artefacts are retired"). `/checkpoint --scope corpus` *detects* intent-vs-shipped drift after the fact; `/close-out` *acts* to close that drift at ship time — they compose: checkpoint catches what drifted post-ship or what close-out missed.

## When to run

- User types `/close-out <slug>` (explicit trigger; slug required).
- User says "close out `<slug>`", "reconcile what shipped for `<slug>`", "wrap up the `<slug>` work", "retire the `<slug>` plan now it's shipped".
- **The execute-side invitation:** `/execute` *offers* `/close-out` when a plan completes with all done-criteria met (execute is the doorway; the user invokes; this skill does the work). The offer is never an auto-run.
- **Otherwise never auto-fires.** Mode A. It **moves files and edits the canonical spec** — both reversible-with-effort but not cheap to undo — so every write passes a propose-confirm gate (§ below). No hook, no session-end trigger.

## Precondition — the change is actually shipped

Close-out reconciles *shipped reality* into the spec. Before doing anything, confirm the slug's work is genuinely done, not merely plan-complete:

- A plan exists at `.claude/plans/<slug>/` whose status is `active` (or the work plainly shipped under this slug).
- The done-criteria are **met** — check the spec's `done_criteria` against the working tree / the user's confirmation. If `/execute` just reported done-criteria met, that is the signal; otherwise ask: *"Confirm `<slug>` shipped and its done-criteria are met? Close-out reconciles shipped reality into the spec — a premature close-out enshrines an unfinished change. (y/N)"*
- **Done-criteria met ≠ merged.** If the work is verified locally but not yet merged/released, say so and let the user decide whether to close out now or after merge. Default: close out on the user's confirmation, not on a guess.

If the slug has no spec (a `--task`-mode build with no `.claude/specs/<slug>/`), there is nothing to reconcile *into* — skip reconcile, run retire + record only, and tell the user reconcile was skipped (no spec).

## Procedure

### 1. Resolve the slug and its artefacts

Locate, under `$CLAUDE_PROJECT_DIR/.claude/` (cwd fallback if the env var is unset):

- **Spec:** `.claude/specs/<slug>/` — read INDEX.md for the active version (`v<M>.md`). This is the **reconcile target**.
- **Plan:** `.claude/plans/<slug>/` — active + superseded versions. **Retire target.**
- **Blueprint / design doc:** `.claude/docs/<slug>/` — active + superseded versions (the blueprint tree, per `/blueprint`). **Retire target.**
- **Superseded spec versions:** any `v<K>.md` in the spec folder with `status: superseded`. **Retire target** (the *active* reconciled spec stays).

State the resolved set before proposing anything: *"Found for `<slug>`: spec v<M> (active), plan v<N>, blueprint v<P>, 2 superseded spec versions."* If the slug resolves to nothing, stop: *"No `<slug>` artefacts under `.claude/`. Nothing to close out."*

### 2. Reconcile — make the spec current (propose-confirm)

The spec is **intent at spec-time** (done-criteria frozen). The shipped change routinely diverges — every shipped proposal in this corpus carries "ship deviations." Reconcile closes that gap **without losing the intent record**.

1. **Diff spec-vs-shipped.** Reuse the intent-vs-shipped lens from [`retrospect-core`](../retrospect-core/SKILL.md) (the engine `/checkpoint` and `/retrospect` share): read the active spec's intent + done-criteria, read what actually shipped (the working tree for the slug's surface, the plan's outcomes, any in-place proposal "ship deviations" note), and surface the **divergences** — behavior that shipped differently than specced, criteria met by a different mechanism, scope that grew or shrank, decisions made during the build the spec never anticipated.

2. **If there is no material divergence** (shipped == intent): say so and **skip the spec write** — there is nothing to reconcile. Note it (*"Spec v<M> already matches shipped reality — no reconcile needed."*) and go to retire.

3. **If there is divergence:** reconcile via the **spec evolve mechanism** (do not hand-roll a parallel write — invoke [`spec`](../spec/SKILL.md)'s evolve flow, or follow its versioning contract exactly):
 - Write a **new spec version** `v<M+1>.md`, `status: active`, `supersedes: v<M>.md`, whose body says *how the system behaves now* — intent reconciled with shipped reality. The frontmatter `description` notes this is the as-shipped reconciliation.
 - Mark `v<M>.md` `status: superseded`, `superseded_by: v<M+1>.md`. **The intent version stays readable** — this is the load-bearing OQ1 decision: reconcile *appends* a new version, it does **not** overwrite the intent spec. The supersedes chain preserves "what we meant to build" (v<M>) beside "what we shipped" (v<M+1>), which is exactly the record `/checkpoint`'s intent-vs-shipped audit needs. This respects [[version-evolving-artefacts-not-refuse]]: a completion event added on top of versioning, versioning untouched.
 - Update `.claude/specs/INDEX.md` (regenerated from frontmatter, per the spec contract).

4. **Propose before writing.** Show the user the proposed reconciled-spec body (or, for a large spec, the section-level diff: which sections change and how) + which version it becomes, then ask **accept / edit / reject**:
 - **accept** → write `v<M+1>.md`, supersede `v<M>.md`, update INDEX.
 - **edit** → the user revises in prose; re-propose; loop.
 - **reject** → write no spec; tell the user reconcile was declined, and **ask whether to still retire + record** (the retire/record halves are independent of the reconcile write).

 Nothing is written to the spec tree until accept. This is the same propose-confirm-commit gate `spec` / `draft-plan` / `capture` use.

### 3. Retire — move spent artefacts to a dated archive folder (preview, then move)

The reconciled spec stays live. Everything the change consumed becomes audit history.

1. **Archive destination:** `.claude/archive/<YYYY-MM-DD>-<slug>/` (one folder per closed-out change — OpenSpec's `changes/archive/<date>-<name>/` model; OQ2 resolved to per-change folder, not per-artefact). Resolve today's date.

2. **What moves** (the spent working set — *not* the reconciled active spec):
 - The active **plan** version + its superseded predecessors → `archive/<date>-<slug>/plans/`.
 - The active **blueprint** version + predecessors → `archive/<date>-<slug>/docs/`.
 - **Superseded spec versions** (`v<K>.md`, `status: superseded`, including the just-superseded intent `v<M>.md`) → `archive/<date>-<slug>/specs/`. The active reconciled `v<M+1>.md` **stays** in `.claude/specs/<slug>/`.
 - Leave a one-line `archive/<date>-<slug>/README.md`: the slug, the close-out date, the active spec version the change reconciled into, and the changelog line (after § 4). So the archive folder is self-describing.

3. **Preview, then move.** List every source→dest move and ask **accept / skip-retire / cancel**:
 - **accept** → perform the moves (mechanical — this is scripted, not narrated; use `git mv` when the artefacts are tracked so history follows, plain move otherwise).
 - **skip-retire** → leave artefacts in place (e.g. the user wants to keep the plan hot a while longer); proceed to record.
 - **cancel** → stop; nothing moved.

4. **Update the moved trees' INDEX.** After a move, the source INDEX (`plans/INDEX.md`, `docs/INDEX.md`) no longer has rows for the closed-out slug — regenerate it from the remaining on-disk frontmatter (drop the archived rows). The specs INDEX keeps the slug (it now points at the reconciled active version). Do **not** create an INDEX inside the archive folder — the README is the archive's index.

Retire is **mechanical and reversible by a counter-move** — but it edits on-disk state, so it stays behind the preview gate. Never move without showing the move list.

### 4. Record — one ship line to the canonical changelog

The change shipped; record it **once**. Invoke [`update-changelog`](../update-changelog/SKILL.md) with the unit (the slug + what shipped) — it composes a **ship line** (`✓`) behind its own accept/edit/reject gate and prepends it to `CHANGELOG.md` per the [changelog contract](../../docs/changelog-contract.md). close-out is the **doorway**, update-changelog is the **writer** — this is the named 092→095 seam (`update-changelog` § "Relationship to other organs").

- Pass a terse unit description in changelog voice: *"`<slug>` — <one-line of what shipped>"*.
- `update-changelog` also offers (its § 5) to retire the slug's `BACKLOG.md` row — accept it here; closing out a slug is exactly when its forward-queue row should close.
- If `update-changelog` is unavailable, fall back to a single manual note in `BACKLOG.md` "Recently shipped" (or, post-095, the pointer there) + the `build_progress` memory — but the point is **one** write, not three.

### 5. Close

Report what happened, in one block:

> Closed out `<slug>`:
> - Reconciled → spec v<M+1> (as shipped); intent v<M> superseded, still readable. ← or "no reconcile needed — spec already current"
> - Retired plan v<N>, blueprint v<P>, <K> superseded spec versions → `.claude/archive/<date>-<slug>/`. ← or "retire skipped"
> - Logged a ship line to `CHANGELOG.md`.
>
> The scope chain for `<slug>` is closed. `/checkpoint --scope corpus` still audits the whole later if you want the wider fit-pass.

Do not commit (the user's call). Do not touch the `build_progress` memory or the `CLAUDE.md` coverage map — those stay their own narrative records (changelog-contract § 6).

## What /close-out does NOT do

- **Does not auto-fire and does not auto-write.** Mode A. Every spec edit and file move passes a propose-confirm gate; execute only *offers* it.
- **Does not overwrite the intent spec.** Reconcile *appends* a new `as-shipped` version; the intent version is superseded, not deleted — the supersedes chain preserves both ([[version-evolving-artefacts-not-refuse]]).
- **Does not replace spec versioning.** It adds the **completion event** versioning lacks; supersedes chains stay exactly as `spec` / `draft-plan` write them.
- **Does not delta-merge.** Reconcile is propose-confirm prose editing (our specs are prose, not OpenSpec's requirement-tuples) — not a mechanical ADDED/MODIFIED/REMOVED merge (that is the separate, unbuilt delta-spec question).
- **Does not replace git.** Git records the *code* diff; close-out reconciles the *spec* + retires *working artefacts*. Different layer.
- **Does not write three ledgers.** The record step is **one** changelog line (via `update-changelog`), not the hand-copy into BACKLOG + build_progress + coverage map the corpus did before 095.
- **Does not delete artefacts.** Retire *moves* to a dated archive folder (audit history kept), it does not destroy.
- **Does not run `/checkpoint`.** Reconcile closes drift at ship; checkpoint audits the wider corpus later. Distinct lenses.

## Relationship to other organs

- **026 (done-criteria)** — the boundary's *open*; `/close-out` is the boundary's *close*. Symmetric pair around the change.
- **068 (checkpoint)** — detects intent-vs-shipped drift *after* the fact (corpus scope); `/close-out` reconciles it *at ship*. 068 audits, 092 acts; they compose. `/close-out` reuses `retrospect-core`'s intent-vs-shipped diff lens.
- **spec (010/026)** — the reconcile write goes through spec's evolve mechanism + versioning contract; close-out does not hand-roll a parallel spec writer.
- **draft-plan (010/051) / blueprint / execute** — the forward chain `/close-out` terminates. execute offers `/close-out` on done-criteria-met (the invitation). The plan + blueprint are the artefacts retire moves.
- **recap** — the session-close organ; when a session's wrap-up includes a shipped feature, recap *offers* `/close-out <slug>` for it (one writer per object: recap records the session, close-out reconciles the feature). Distinct subjects (session vs slug), distinct directions (forward note vs backward reconcile).
- **update-changelog** — the **record** step's writer; close-out is a doorway, update-changelog owns the CHANGELOG write + the BACKLOG-row sync. The named 092→095 seam.
- **retrospect-core** — the intent-vs-shipped diff engine reconcile borrows (shared with checkpoint/retrospect).
- **[[version-evolving-artefacts-not-refuse]]** — the decision close-out respects: a completion event on top of versioning, not a replacement for it.

See the slug's spec under `.claude/specs/` for the design rationale and the resolved open questions.
