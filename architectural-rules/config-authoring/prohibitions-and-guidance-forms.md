---
name: Prohibitions and guidance forms
description: "A prohibition is four classes, not one — only composition prohibitions backfire. Match guidance form to failure pattern; micro-test wording changes before sweeping."
type: user
kind: architectural-rule
scope: [config-authoring, prompt-engineering]
relevance: when-touching-skills, when-touching-agents, when-touching-rules, when-touching-hooks, when-authoring-instructions, during-review
---

- <!-- id: four-classes --> A prohibition is one of four classes; classify before rewriting or adding one. **Tripwires** (concrete token-level self-checks) work. **Recognition tables** (red-flag patterns caught at review time) work. **Discrete prohibitions** ("do not ask X to do Y", no competing incentive) work. **Composition prohibitions** — where the model has its own agenda for the output (restating a spec feels helpful to it) — backfire: naming the banned behaviour makes it more available. Only the fourth class needs rewriting, as a positive recipe stating what the output IS.
- <!-- id: no-nuance-clauses --> Never add nuance clauses to a winning recipe. Measured result: a single added nuance clause degraded a consistent recipe to noisy. If an exception is real, it needs its own tested rule, not a rider.
- <!-- id: guidance-form-table --> Match guidance form to failure pattern: behaviour violation under pressure → prohibition + rationalization table + red flags; wrong output *shape* → positive recipe; omitted elements → structural template with REQUIRED fields; conditional behaviour → key the condition to an **observable predicate**, never an exemption clause ("unless it matters" reopens negotiation; "unless the file exceeds N lines" doesn't).
- <!-- id: description-shape --> Skill/agent descriptions state **triggering conditions only** ("Use when…"), never a workflow summary. A description that summarizes the workflow becomes a shortcut agents take instead of reading the body — the body degrades to documentation agents skip.
- <!-- id: micro-test-wording --> A prompt edit is cheaply falsifiable — micro-test it before any corpus-wide sweep: 5+ repetitions per wording variant, fresh context each run, a no-guidance control arm, programmatic scoring plus manual review of every match. Cost is cents per sample; arguing about wording is more expensive than measuring it.

**Why:** rewriting prohibitions wholesale churns the three classes that already work and pays tokens for the churn; leaving composition prohibitions in place actively steers toward the banned output. Classification is what makes the edit surgical, and the micro-test is what makes it falsifiable. (Classification and measurement method: obra/superpowers positive-instruction-redesign work, independently corroborating the pink-elephant effect at higher resolution.)
