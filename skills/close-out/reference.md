# close-out: reference

Read when the step you are on points here, or when something fails.

## What /close-out does NOT do

- **Does not auto-fire and does not auto-write.** Mode A. Every spec edit and file move passes a propose-confirm gate; execute only *offers* it.
- **Does not overwrite the intent spec.** Reconcile *appends* a new `as-shipped` version; the intent version is superseded, not deleted — the supersedes chain preserves both.
- **Does not replace spec versioning.** It adds the **completion event** versioning lacks; supersedes chains stay exactly as `spec` / `draft-plan` write them.
- **Does not delta-merge.** Reconcile is propose-confirm prose editing (our specs are prose, not requirement-tuples) — not a mechanical ADDED/MODIFIED/REMOVED merge.
- **Does not replace git.** Git records the *code* diff; close-out reconciles the *spec* + retires *working artefacts*. Different layer.
- **Does not write three ledgers.** The record step is **one** changelog line (via `update-changelog`), not a hand-copy into BACKLOG + the ship-narrative record + coverage map.
- **Does not delete artefacts.** Retire *moves* to a dated archive folder (audit history kept), it does not destroy.
- **Does not run `/checkpoint`.** Reconcile closes drift at ship; checkpoint audits the wider corpus later. Distinct lenses.

## Relationship to other organs

- **spec done-criteria** — the boundary's *open*; `/close-out` is the boundary's *close*. Symmetric pair around the change.
- **checkpoint** — detects intent-vs-shipped drift *after* the fact (corpus scope); `/close-out` reconciles it *at ship*. checkpoint audits, close-out acts; they compose. `/close-out` reuses `retrospect-core`'s intent-vs-shipped diff lens.
- **spec** — the reconcile write goes through spec's evolve mechanism + versioning contract; close-out does not hand-roll a parallel spec writer.
- **draft-plan / blueprint / execute** — the forward chain `/close-out` terminates. execute offers `/close-out` on done-criteria-met (the invitation). The plan + blueprint are the artefacts retire moves.
- **recap** — the session-close organ; when a session's wrap-up includes a shipped feature, recap *offers* `/close-out <slug>` for it (one writer per object: recap records the session, close-out reconciles the feature). Distinct subjects (session vs slug), distinct directions (forward note vs backward reconcile).
- **update-changelog** — the **record** step's writer; close-out is a doorway, update-changelog owns the CHANGELOG write + the BACKLOG-row sync. The close-out→changelog seam.
- **retrospect-core** — the intent-vs-shipped diff engine reconcile borrows (shared with checkpoint/retrospect).
- **Versioning discipline** — a completion event on top of versioning, not a replacement for it.
