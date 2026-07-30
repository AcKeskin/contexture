---
name: Disclosure claims cite a number
description: "A progressive-disclosure claim ('this moves cost off the always-on tier') cites a context-cost measurement or is marked untested — never implied certainty."
type: user
kind: architectural-rule
scope: [config-authoring, context-budget]
relevance: when-touching-skills, when-touching-rules, when-authoring-instructions, during-review
---

- <!-- id: cite-or-mark-untested --> A change justified by disclosure economics ("moves cost off the always-on tier", "cheaper as a reference file loaded on trigger") either cites a `scripts/context-cost.js` measurement (arm deltas, not totals) or carries an explicit "untested — judgment call" marker.
- <!-- id: measure-real-tasks --> Measure real recent tasks, never a synthetic query invented to flatter the preferred arm. The interesting number is the disclosure tax: what the split forced the model to read back in anyway.

**Why:** a corpus can be refactored for disclosure, end up more complex than a flat one, and not be cheaper — and nothing detects that unless claims carry numbers. Stating "untested" is honest; implying measurement that never happened is how structural drift hides.
