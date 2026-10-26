---
name: Contract enforcement
description: "A contract stated in a body is either checkable or it is a checklist item. Decide which, say which, and give every checker fixtures on both polarities."
type: user
kind: architectural-rule
scope: [config-authoring, verification]
relevance: when-touching-skills, when-touching-rules, when-touching-hooks, when-authoring-instructions, during-review
---

- <!-- id: checkable-ships-a-checker --> **A body-stated contract that a script could evaluate ships with the script.** If the contract is a property of a file on disk — a required frontmatter key, a byte or word cap, a cross-reference that must resolve, a generated copy that must match its source — prose alone will not hold it. A rule that only lives in prose ships broken examples, and they pass every gate that does not read the thing the rule is about.
- <!-- id: both-polarities --> **A checker carries fixtures on both polarities.** A violating case must be reported *and* the legal cases must not be. A checker tested only on violations is a false-positive generator waiting for its first real run; one tested only on clean input proves nothing.
- <!-- id: name-what-it-misses --> **State what the checker does not cover.** Where a contract has a checkable part and a judgment part, gate the first and leave the second an explicit checklist item. Silence reads as coverage, and a partly-gated contract that looks fully gated is worse than an ungated one nobody trusted.
- <!-- id: place-the-gate-early --> **Put the gate where the defect is authored, not where it is discovered.** A contract enforced only at consumption time — a plan step missing its verification, caught when execution reaches it — is found at the most expensive moment. The runtime gate stays; add the authoring-time one.
- <!-- id: unenforceable-says-so --> **A contract that cannot be checked says so.** "Surface assumptions before coding" and "every changed line traces to the request" are judgment and always will be. Label them, rather than letting them sit in the same voice as the enforced ones — a reader cannot tell a gate from an aspiration by tone.

**Why:** the corpus already does this eight times over (leak scan, residue check, projection drift, byte and token budgets, symlink drift, stale spec pins, agent output contract) without ever having named it, so new contracts get written as prose by default and the pattern is rediscovered per-case. Naming it makes the check the default question when a contract is authored: is this a gate or a checklist, and which am I about to imply?
