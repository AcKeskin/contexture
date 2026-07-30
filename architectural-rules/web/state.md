---
name: Web state flow
description: Predictable state flow. No magic globals. State changes are explicit and traceable.
type: user
kind: architectural-rule
scope: [web, state]
relevance: when-language-web
---

- <!-- id: web-state-unidirectional --> State flow is predictable: state in → render out → action → state in. Unidirectional.
- <!-- id: web-no-window-globals --> No magic globals. No `window.*` mutation for app state.
- <!-- id: web-state-changes-explicit --> State changes are explicit and traceable — every change has an identifiable source (action, event handler, effect).
- <!-- id: web-derived-state-preferred --> Prefer derived state over duplicated state. If two pieces of state can disagree, one is wrong.

**Why:** state bugs are the hardest to reproduce. Predictable flow is the minimum insurance. Source: Flux / Redux unidirectional-data-flow docs.
