---
name: Python idioms
description: EAFP over LBYL, comprehensions for simple cases, truthiness for emptiness but is None for None, no mutable default args.
type: user
kind: architectural-rule
scope: [python, idioms]
relevance: when-language-python
origin: shipped
---

<!-- id: eafp --> Prefer EAFP ("easier to ask forgiveness than permission") — `try/except` around the operation — over LBYL pre-checks where it reads cleaner and avoids time-of-check/time-of-use races.
<!-- id: comprehensions --> Use comprehensions for simple transforms: one `for` clause, at most one filter. If it needs more, use an explicit loop — readability beats density.
<!-- id: truthiness --> Use implicit falsiness for emptiness (`if not items:`), but `if x is None:` for None — do not conflate None with empty or zero.
<!-- id: no-mutable-defaults --> Never use a mutable object (`[]`, `{}`, `set()`) as a default argument — it is created once and shared across all calls. Default to `None` and construct inside the body.

**Why:** the mutable-default-argument trap is a silent shared-state bug that survives review; conflating None with falsy is the other classic Python footgun. Source: Google Python Style Guide.
