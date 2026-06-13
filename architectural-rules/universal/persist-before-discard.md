---
name: Persist decisions before discarding context
description: Before suggesting the user clear context / start fresh / compact, check for decisions made this session that are still only in volatile context, and advise /recap (and /capture for rule-tier items) first.
type: user
kind: architectural-rule
scope: [claude-code, session-lifecycle, universal]
relevance: during-session-close
---

<!-- id: persist-before-discard-check --> Before suggesting the user clear context, start a fresh session, or compact, first check whether any decision, trade-off, or non-obvious finding made this session is still only in volatile context.
<!-- id: persist-before-discard-route --> If so, advise `/recap` (and `/capture` for rule-tier items) **first**. Never lead with "want to clear context?" while undocumented decisions are pending.
<!-- id: persist-before-discard-mechanical --> This rule shapes intent; the mechanical backstop is the `clear-context-decision-guard.js` SessionStart hook, which surfaces a recovery nudge at the *next* session start if a cleared/compacted session left decisions unrecapped. Rule and hook must stay aligned — drift between them is itself a flag.

**Why:** A settled decision ("we chose A over B because C") is exactly the terse, load-bearing fact a context clear or autocompaction summary flattens or drops. The cost of forgetting is concrete; the cost of one extra recap prompt is trivial. Surface at the moment of intent, not after the loss.
