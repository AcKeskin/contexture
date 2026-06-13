---
name: Python typing
description: PEP 484 annotations on public APIs, Optional/X|None explicit, abstract types for params, no bare Any, Protocol for structural typing.
type: user
kind: architectural-rule
scope: [python, typing]
relevance: when-language-python
origin: shipped
---

<!-- id: annotate-public --> Annotate public APIs and anything hard to understand without types (PEP 484). Types are checked documentation — they catch contract drift the tests miss.
<!-- id: explicit-optional --> Express nullability explicitly: `Optional[X]` or `X | None`. Do not rely on an un-annotated `= None` default to imply it.
<!-- id: abstract-params --> Accept abstract types in parameters (`Sequence`, `Mapping`, `Iterable`) and return concrete types. Be liberal in what you accept, specific in what you produce.
<!-- id: no-bare-any --> Do not use bare `Any` when a precise type is knowable — it disables checking for that value and everything derived from it. Reserve it for genuine dynamic boundaries.
<!-- id: protocol --> Prefer `Protocol` (structural typing) over an ABC when you only need "has these methods" and don't control the implementers.

**Why:** gradual typing only pays off if the annotations are precise — a single `Any` poisons inference downstream, and an implicit `None` default is the classic un-caught crash. Source: PEP 484, Google Python Style Guide.
