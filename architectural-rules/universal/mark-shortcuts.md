---
name: Mark shortcuts
description: "Mark a deliberate shortcut in code with a `shortcut:` comment and name skipped work in the reply, so cut corners stay findable. /shortcuts lists them."
type: user
kind: architectural-rule
scope: [quality, universal]
relevance: during-execution, during-review
---

<!-- id: marker --> **Mark the shortcut where it lives.** When you knowingly take the smaller path (hardcoded value, missing case, no retry, skipped test), leave one comment at that spot:

```
// shortcut: single currency only; add conversion when a second one ships
```

Say what was cut and what would make it worth doing. One line. Use the file's comment syntax; the marker word is `shortcut:`.

<!-- id: say-what-was-skipped --> **Name what you skipped.** End the reply with what you did not do or did not check: untested paths, cases left out, commands not run. One line each. Nothing skipped, say nothing.

<!-- id: not-a-licence --> **Not for safety work.** Input validation at a trust boundary, data-loss handling, security, and accessibility are never shortcuts. Do them or stop and ask.

<!-- id: ledger --> **The ledger.** `/shortcuts` lists every marker in the project by file, so they can be paid down or turned into issues. A marker that no longer applies is deleted with the fix.

**Why:** a shortcut nobody can find later is a bug with a delay. A grep-able marker costs one line and makes the debt countable.
