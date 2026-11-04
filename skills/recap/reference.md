# recap: reference

Read when the step you are on points here, or when something fails.

## Failure modes

- **Ambiguous primary goal** (session covered multiple unrelated threads). Ask one clarifying question: *"This session touched X, Y, and Z. Which is the primary focus of the recap, or would you prefer three separate recaps?"* Do not guess.
- **No session content to recap** (fresh session with no tool use, no commits). Decline gracefully: *"Nothing substantial to recap yet — ask again once the session has produced work."*
- **Git not available or not a repo.** Omit the `branch` field and `Completed` commit list; still write the recap.
- **User-supplied title conflicts with an existing file.** Propose a disambiguating slug; do not silently overwrite.
- **`sessions/` folder owned by another process** (unlikely but possible with multiple Claude sessions). Re-check before write; if the file appeared mid-draft, prompt the user.

## What recap does NOT do

- **Does not auto-fire.** Ever. Mode B parked.
- **Does not do cross-session consolidation.** Recap is strictly **micro/episodic** — one session, what happened today, what's next tomorrow. Stepping back over the *body* of many sessions/ships to ask "what still coheres, what's drifted" is the corpus checkpoint's job ([checkpoint](../checkpoint/SKILL.md) --scope corpus). Recap *feeds* it (recaps are an input corpus, swept by the uncaptured-lessons pass); it does not aggregate across sessions itself.
- **Does not summarise each tool call.** That's claude-mem's granularity; recap rejects it as too noisy. Recap is session-level, not tool-level.
- **Does not sync across machines.** Memory is local by design. Each PC has its own session log.
- **Does not write directly to rule-tier memory.** Promotion flows through capture so classification is consistent.
- **Does not update `MEMORY.md`'s index entries.** Recaps are discovered by folder scan, not via the index. (It DOES update the budget scoreboard header — §9 — but never the per-memory index lines.)
- **Does not manage recap retention.** Keep recaps indefinitely; discovery ages auto-surfacing at 30 days; manual pruning only. (It DOES run the corpus bloat check on rule-tier memory — §9 — but only surfaces a nudge, never prunes unprompted.)

## Relationship to other organs

- **capture** — promotion path. Recap's Learned items pass through capture to become rule-tier memories.
- **checkpoint (corpus scope)** — the macro aggregator above recap. Recap is the per-session feeder; the corpus checkpoint sweeps *all* recaps since its last run for `Learned` items the per-session promotion pass (§8) missed, and consolidates across the body of work recap only records one slice of.
- **discover** — discovery scans `sessions/` as a retrieval source with a 30-day auto-surface cutoff (see discover §8a).
- **deliver** — recaps render as tier `session-recap` in delivery's default ordering, between project-facts and codemap.
- **git log** — complementary, not duplicative. Git is authoritative for commits; recaps add the *why* and *what was learned* that commit messages don't capture.
- **update-changelog** — recap *offers* a changelog ship line for a session's shipped unit (§7.4); update-changelog is the writer. recap = per-session episodic record; changelog = the canonical chronological ship index.
- **close-out** — when a session shipped a *feature* (a slug with a spec/plan), recap §7.4 offers `/close-out <slug>` (the superset that reconciles the spec + files the plan + logs the ship line) instead of the bare changelog offer. recap is about the **session**; close-out is about the **feature** — distinct subjects, so recap is a doorway, not the closer.
- **wrap** — the session-terminus driver invokes recap (with `--under-wrap`, Inputs §4) as one step of the closing ceremony. Under that signal recap **suppresses its §7.4 offers** — `/wrap` owns the close/changelog doorways, so recap doesn't double-offer. Standalone `/recap` keeps §7.4 firing. recap is a step of `/wrap`, not the other way round.

See [`docs/recap-organ.md`](../../docs/recap-organ.md) for the two-tier memory model and retention policy.
