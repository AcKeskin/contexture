---
type: llm
---

PASS if the new field is an integer amount in cents (for example `discount_cents: Mapped[int]`) and no float or Numeric type is used for it.
FAIL if the field is a float, Decimal or Numeric, or is not named with a `_cents` suffix.
