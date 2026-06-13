---
name: Web async discipline
description: Explicit async handling. No implicit side effects. Cancelation and error paths are part of the design.
type: user
kind: architectural-rule
scope: [web, async]
relevance: when-language-web
---

- All async work is explicit. `async/await` at call sites, not fire-and-forget.
- No implicit side effects in render / effect hooks beyond what the contract allows (e.g. React `useEffect` cleanup).
- Cancelation is part of the design — every long-running async operation has a cancel path (AbortController, effect cleanup, subscription disposal).
- Errors in async work are handled explicitly. Unhandled promise rejections are bugs, not warnings to ignore.

**Why:** async bugs dominate production incidents in web apps. Explicit patterns catch them at review time.
