---
type: llm
---

PASS if the reply says `users.find` can return undefined (no user with that id) and line 4 then reads `user.email`, which throws.
FAIL if it misses that bug, or only lists style points.
