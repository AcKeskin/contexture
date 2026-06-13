---
name: Naming (universal)
description: Filename matches type name; one type per file; no V2/New/Final suffixes — replace or rename to _OLD
type: user
kind: architectural-rule
scope: [naming, universal]
relevance: always
---

- One type per file. Filename matches type name exactly.
- No versioning suffixes in names: `New`, `V2`, `Final`, `Redesigned`. If an old version must coexist, rename the old one to `<Name>_OLD` and delete once the new one is proven.
- Language-specific casing conventions (PascalCase, camelCase, snake_case) live in per-language rules under `<lang>/naming.md`.

**Why:** suffixes like `V2` become permanent; `_OLD` is a visible debt you cannot ignore.
