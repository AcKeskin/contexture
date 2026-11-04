# dispatch: consult returns

Read when a unit runs below the parent's tier. It gives the prompt lines to add and the two parent-side rules.

## Consult returns (below-parent-tier units)

A unit dispatched below the parent's tier trades judgment for cost — so give it a channel to borrow judgment back instead of guessing. The mechanism is the existing return posture, not new machinery: a consult is a BLOCKED-shaped return carrying one specific question plus the evidence that raised it. The parent answers tersely and re-dispatches the same unit with the answer appended (or continues the agent, where the platform supports continuing a spawned agent). **Continue or resume a unit only if nothing else has touched that unit's files since it was dispatched** — otherwise dispatch fresh; a resumed session is repairing against a stale world. For serialized units the condition holds trivially; for concurrent ones a violation means two units shared files that shouldn't have — a placement bug surfacing late, worth naming aloud rather than silently repairing around.

For every below-parent-tier dispatch, add these lines to the unit's prompt (alongside the depth annotation and the harvest invitation):

> If you hit any of these, stop and return a consult — one short, specific question plus the evidence that raised it — rather than pushing through: (1) you are about to take your first state-changing action and the approach wasn't fully specified; (2) you are stuck — the same error twice, or results that don't fit; (3) you are about to switch approach. Before returning a consult or a done result, make your work durable first — write the file, commit in your worktree; a durable partial survives, an unwritten one doesn't. If your own evidence contradicts guidance you were given, don't silently pick a side — return the conflict: "found X, was advised Y — which constraint wins?"

Parent side, two rules:

- **Answer tersely.** A consult answer is direction — a few sentences naming the constraint that breaks the tie — never a redo of the unit's work. If answering properly requires doing the work, the unit was mis-tiered; take it over.
- **Cap at two consults per unit.** A unit that needs a third consult isn't mechanical — it was mis-scoped or mis-tiered. Split it or run it at parent tier.

Do not add the consult lines to parent-tier dispatches: an executor already at the parent's tier gains nothing from consulting the parent, and a mandated consult there produces ceremony instead of judgment. Lower tiers under-consult by default and need the triggers stated explicitly; that asymmetry is the point.

For **lowest-tier** executors, soft triggers are not enough — observed behavior is that they resolve convention conflicts with silent local judgment rather than consulting. Phrase the deviation trigger as a hard rule on those dispatches: *"Hard rule: if the instructions' conventions do not fit what you find in a file — wrong structure, a case the conventions never mention — you MUST stop and return a consult before editing that file. Deciding the exception yourself is the one thing you may not do."*
