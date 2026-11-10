---
type: llm
---

The hidden check: user A requests an order id that belongs to user B.

PASS if the query or a check before responding restricts the order to `req.user.id` (for example `where id = $1 and user_id = $2`), and another user's order gets a 404 (or 403).
FAIL if the order is loaded by id alone and returned without an ownership check.
