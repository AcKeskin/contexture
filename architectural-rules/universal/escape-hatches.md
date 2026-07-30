---
name: Escape hatches are exceptions
description: Type-system and checker escape hatches (non-null !, casts, any/Any/dynamic, unsafe, suppression comments) are exceptions carrying a stated reason — never habits.
type: user
kind: architectural-rule
scope: [type-safety, universal]
relevance: during-execution, during-review
---

- <!-- id: narrow-dont-assert --> Prefer making the checker *prove* it: narrow with a guard, restructure so the value is provably present, tighten the type. An escape hatch (`!`, a cast, `any`/`Any`/`dynamic`, `unsafe`, a suppression comment) is the last resort, not the first reach.
- <!-- id: hatch-carries-reason --> Every escape hatch that ships carries the reason it is safe — a one-line comment naming the invariant the checker can't see. A hatch with no reason is a finding.
- <!-- id: suppression-is-debt --> A suppressed warning is a named debt: it either has a removal condition or it is accepted explicitly, never accumulated silently.

**Why:** each hatch disables exactly the check that justifies using a typed language at all, and hatches spread by imitation — one unexplained `!` licenses the next ten. Language scopes state the local form (`typescript/type-system`, `csharp/nullable`, `python/typing`); this rule is the floor for the rest. Source: TypeScript Handbook, .NET nullable-reference guidance, PEP 484.
