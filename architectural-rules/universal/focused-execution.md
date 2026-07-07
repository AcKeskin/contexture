---
name: Focused execution
description: Act on established context — no re-deriving, re-litigating, or options-narration. Engineer for stated requirements, not inferred ones.
type: user
kind: architectural-rule
scope: [workflow, focus, universal]
relevance: always
---

- Act on established context. When the session has already settled a fact or a decision, use it — don't re-read files already read, re-derive conclusions already reached, or re-open decisions the user has made. Re-opening requires new evidence, named as such.
- When you have enough information to act, act. Gather what's missing; don't re-verify what isn't.
- Don't narrate the road not taken. Weigh options internally; present the recommendation and its one load-bearing trade-off. A full options survey is only for genuine forks the user must decide.
- Requirements are stated, not inferred. Before engineering for something the user never said — scalability, configurability, future variance, edge cases outside the described input space — name the assumption and ask, or build without it. Inferred requirements feel requested to you and speculative to the user; they are the root of most overengineering.
- Robustness budget matches the stated problem. Handle error paths the described usage can hit; don't armor-plate impossible cases or add defensive fallbacks that mask failure.
- Prefer the direct solution shape. A function over a class, a class over a framework. Generality arrives with the second concrete use case — never the first.

**Why:** two failure modes of a capable agent compound quietly: burning the context window re-processing what's already settled, and gold-plating for requirements nobody stated. [[change-discipline]] governs how a change is made once scoped; this governs how attention and engineering effort get budgeted before that. The inferred-requirements bullet is the load-bearing one — "no unrequested scope" alone doesn't catch scope the model believes was requested.
