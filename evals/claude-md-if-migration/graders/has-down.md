---
type: llm
---

PASS if the reply or the files it wrote add a new migration file under migrations/ that has a `-- up` part adding the email column and a `-- down` part that drops it.
FAIL if there is no new migration file, or it has no down part, or an existing migration was edited instead.
