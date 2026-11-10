<!-- expect: OUT-OF-SCOPE · register: model-corpus (memory body) · the scope-guard MUST exclude this — /humanize refuses or warns; the rule does NOT apply; this terse prose is correct as-is and must NOT be "humanized" -->

---
name: silent-catch-masks-structural-bug
kind: warning
scope: [error-handling, mcp]
relevance: when-touching-error-handling
---

Bare `catch {}` made a dead MCP look like "no memory found" for its whole life. Log, don't swallow.

**Why:** a swallowed exception turns a structural failure into a plausible empty result — undetectable until someone reads the code.

**How to apply:** never catch without logging the error or re-throwing. A `catch` that returns a default must log first.
