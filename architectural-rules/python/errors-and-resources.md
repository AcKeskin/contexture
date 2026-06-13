---
name: Python errors and resources
description: Catch specific exceptions, never bare except, with-managed resources, minimal try body, no __del__ for cleanup.
type: user
kind: architectural-rule
scope: [python, errors, resources]
relevance: when-language-python
origin: shipped
---

<!-- id: specific-except --> Catch the most specific exception type. Never a bare `except:` — it swallows `SystemExit` and `KeyboardInterrupt`. Use `except Exception:` only at a top-level boundary, and re-raise or log.
<!-- id: minimal-try --> Keep the `try` body minimal — only the line that can raise. A fat try block catches failures you didn't mean to catch.
<!-- id: with-resources --> Manage resources (files, locks, connections) with `with`. Deterministic release at block exit — do not rely on `__del__` or GC timing.
<!-- id: chain-exceptions --> Preserve context when re-raising: `raise NewError(...) from err`. Bare `raise NewError(...)` inside an `except` loses the original cause.

**Why:** a bare `except` turns Ctrl-C and clean shutdown into a hang, and GC-timed resource release leaks file handles under load. Source: Google Python Style Guide.
