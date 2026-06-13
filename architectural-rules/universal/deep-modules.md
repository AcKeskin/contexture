---
name: Deep modules (universal)
description: Module depth as a design heuristic — small interface, deep implementation. Deletion test, two-adapter rule, vocabulary discipline.
type: user
kind: architectural-rule
scope: [architecture, design, universal]
relevance: during-review, during-planning
---

From Ousterhout, *A Philosophy of Software Design*. Use these terms exactly. Don't substitute "component," "service," "API," or "boundary" — vocabulary drift defeats the point.

## Vocabulary

- **Module** — anything with an interface and an implementation. Scale-agnostic: function, class, package, slice.
- **Interface** — everything a caller must know to use the module correctly. Includes the type signature, but also invariants, ordering, error modes, required config, performance characteristics. *Avoid* "API" / "signature" — those refer only to the type-level surface.
- **Implementation** — what's inside the module.
- **Depth** — leverage at the interface. **Deep** = a lot of behaviour behind a small interface. **Shallow** = interface nearly as complex as the implementation.
- **Seam** *(Feathers)* — where an interface lives; a place behaviour can be altered without editing in place. *Avoid* "boundary" — it collides with DDD's bounded context.
- **Adapter** — a concrete thing that satisfies an interface at a seam. Describes role (which slot), not substance (what's inside).
- **Leverage** — what callers get from depth. Capability per unit of interface they have to learn.
- **Locality** — what maintainers get from depth. Change, bugs, knowledge, verification concentrate at one place.

## Operational rules

- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through — delete it. If complexity reappears spread across N callers, it was earning its keep — keep it.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is the wrong shape — redesign before adding a back door.
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a seam unless something actually varies across it.
- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small swappable parts — they just aren't part of its interface.

**Why:** these primitives unify several otherwise-separate disciplines (SRP, layering, testability, refactor cost). The deletion test is the cheapest signal you have for "is this abstraction earning its keep." The two-adapter rule prevents premature seams that pretend to be flexibility but cost real complexity.

**How to apply:** during design — name the deepened module before you write it; check the deletion test on any small new module. During review — flag shallow modules (interface ≈ implementation) and pass-throughs. During refactor planning — talk in this vocabulary so the proposed change has a precise shape.
