---
name: Python naming and layout
description: PEP 8 casing (snake_case funcs, CapWords classes, ALL_CAPS constants), 4-space indent, leading-underscore for non-public, no ambiguous single chars.
type: user
kind: architectural-rule
scope: [python, naming, layout]
relevance: when-language-python
origin: shipped
---

<!-- id: casing --> Casing per PEP 8: `snake_case` for functions, variables, methods, modules; `CapWords` for classes and exceptions (suffix error types with `Error`); `ALL_CAPS_WITH_UNDERSCORES` for module-level constants. Packages are short, all-lowercase, no underscores.
<!-- id: non-public --> Mark non-public names with a single leading underscore (`_internal`). Reserve the double leading underscore (`__x`) for name-mangling to avoid subclass clashes — not as "more private".
<!-- id: no-ambiguous --> Never name anything `l`, `O`, or `I` — indistinguishable from `1` and `0` in many fonts.
<!-- id: indent --> 4 spaces per indent level, never tabs (Python 3 forbids mixing). Two blank lines around top-level defs, one around methods.
<!-- id: imports --> One import per line. Group standard-library, third-party, then local, separated by blank lines. Absolute imports over relative; never wildcard `from x import *`.

**Why:** Python's stdlib and the whole ecosystem pattern-match on PEP 8 — code that violates it reads as broken even when it works, and tooling (linters, IDEs) assumes it. Source: PEP 8.
