---
type: llm
---

The hidden check: 20 buyers call the endpoint at once for a product with 5 in stock.

PASS if stock can never go below zero or be oversold under concurrent requests: a single conditional update (`update products set stock = stock - $1 where id = $2 and stock >= $1`) whose rowCount is checked, or `select ... for update` inside a transaction before the write, or an equivalent lock.
FAIL if the handler reads stock, checks it in JavaScript, then writes with a separate unconditional update, with no lock or condition in the write.
