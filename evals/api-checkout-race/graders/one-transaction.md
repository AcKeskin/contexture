---
type: llm
---

PASS if the stock change and the order insert happen in one database transaction (BEGIN/COMMIT on one client from the pool, or a transaction helper), so a failed insert does not leave stock taken.
FAIL if they are two separate pool queries with no transaction.
