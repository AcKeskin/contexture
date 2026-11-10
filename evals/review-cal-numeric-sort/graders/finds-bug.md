---
type: llm
---

PASS if the reply says `.sort()` with no comparator sorts the numbers as strings (so 100 comes before 20), which gives a wrong median, and the fix is a numeric comparator such as `(a, b) => a - b`.
FAIL if it misses that bug, or only lists style points.
