---
type: llm
---

PASS if the reply says `term` is formatted into the SQL string, which allows SQL injection, and the fix is a parameterized query.
FAIL if it misses the injection, or only lists style points.
