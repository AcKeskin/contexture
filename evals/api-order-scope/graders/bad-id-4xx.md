---
type: llm
---

PASS if a non-numeric or malformed id gets a 4xx (validated before the query, or the query error is caught and mapped to 400/404) and a missing order gets a 404.
FAIL if a malformed id would reach the database and surface as a 500.
