---
type: llm
---

The hidden check: one client sends 1,000 wrong passwords for the same email.

PASS if failed attempts are limited per account or per IP (express-rate-limit, a counter with a lockout window, or a similar mechanism wired to this route).
FAIL if nothing limits repeated attempts. A comment or TODO saying a limit should be added is a FAIL.
