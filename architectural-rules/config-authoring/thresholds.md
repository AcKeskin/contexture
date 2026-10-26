---
name: Thresholds — a count may guard a resource or trip a question, never decide
description: When authoring harness artefacts (skills, agents, rules, hooks), a numeric threshold is legitimate for guarding a measurable resource, pacing a recurring action, or tripping a question, but never for deciding a judgment call. Tripwires state what they proxy; a threshold that cannot name what it stands for gets replaced by the criterion it was standing in for.
type: user
kind: architectural-rule
scope: [config-authoring]
relevance: when-touching-skills, when-touching-agents, when-touching-rules, when-touching-hooks, when-authoring-instructions, during-review
relations:
  - type: related_to
    target: architectural-rules/config-authoring/share-readiness.md
    note: sibling config-authoring rule — both govern authoring the harness, not the code the harness is used to write.
---

This rule governs **authoring the harness itself** (skills / agents / rules / hooks), not a user's project code. Business logic is full of legitimate domain constants; this is about numbers that appear in *instructions*, where they stand in for a decision.

<!-- id: thresholds-three-classes --> Every numeric threshold in an instruction belongs to one of four classes, and only one of them is illegitimate:
<!-- id: thresholds-resource-guard --> **Resource guard** — the number proxies a real, measurable cost: a token budget, a context ceiling, a file-count ceiling above which the work no longer fits. Keep these hard and deterministic. Re-deriving a budget per invocation is worse than stating it, and a guard that bends on request is not a guard.
<!-- id: thresholds-presentation --> **Presentation picker** — the number chooses how output is displayed (render inline vs. render an outline). It decides nothing about the work, so it needs no justification beyond fitting the reader.
<!-- id: thresholds-decision-gate --> **Decision gate — forbidden.** The number stands in for a judgment the author didn't want to specify ("more than N files, so delegate"). It reads as precision and carries none: the count is not what makes the decision right or wrong, so it is right only by coincidence. Replace it with the criteria it was proxying, and if those criteria are hard to state, that difficulty *is* the finding — the decision was never understood well enough to encode.
<!-- id: thresholds-tripwire --> In genuine judgment territory, a number may still appear as a **tripwire**: it carries its rationale in place, and crossing it **surfaces the situational question** rather than resolving it. A partition check that flags "this many modules usually means the boundaries aren't earning their keep — do they here?" is auditable and correct even when the count is wrong, because the count only decides *when to ask*, never *what the answer is*.
<!-- id: thresholds-cadence --> **Cadence guard** — a fourth legitimate class, distinct from the other three: the number decides **when a recurring action next fires**, not whether it is allowed. "Ten turns or two hours since the last run, whichever comes first." A resource guard says *too big, stop*; a cadence guard says *not yet, later*. Pair the two dimensions (a count **and** an elapsed time) rather than picking one — a count alone starves a slow session, a timer alone fires on an idle one.
<!-- id: thresholds-cadence-liveness --> **A cadence guard needs a visible no-op**, because its failure mode is silence. A debounce that never fires and an organ with nothing to report look identical from the outside, and the broken case is the one that stays broken longest. Give the quiet path an explicit, fixed output — a single stated line meaning *ran, found nothing* — so "no output" always means "did not run" and is diagnosable. Optionally ramp: a looser threshold for the first day after install lets the thing be seen working before it goes quiet.
<!-- id: thresholds-name-what-it-proxies --> A threshold that cannot state what it proxies is a smell. Write the rationale next to the number, in the artefact — not in the commit message, not in the design doc. A reader deciding whether to follow a threshold needs to know what it was protecting.

**Why:** the failure mode is quiet. A bare count reads as measured and considered, so nobody revisits it, and the judgment it replaced stays unmade for as long as the artefact lives. Meanwhile the artefact's *legitimate* budgets get treated as equally arbitrary — one made-up number devalues the ones that were computed. Pure judgment is not the alternative: unanchored judgment drifts between sessions and models and cannot be audited. The tripwire keeps the determinism where it belongs (*when do we stop and ask*) and puts the judgment where it belongs (*what do we do about it*).

**Smell:** a comparator in an instruction with no rationale beside it, especially where crossing it changes behaviour rather than triggering a question. Ask what the number is standing in for. If the answer is a property (self-contained, mechanically verifiable, independently reviewable), state the property and delete the number. If the answer is "we had to pick something," it is a tripwire at best — mark it as one and make it ask.
