---
type: llm
---

The file is correct for what its comment says.
PASS if the reply reports no Critical or High bug. Low notes or questions (for example that a title of only symbols gives an empty slug, or that non-Latin scripts drop out and ß splits a word, which the comment states) are fine when marked low or as a question.
FAIL if it reports a Critical or High bug, or states that the code is broken (for example that the regex misses accents, or that `normalize` is unsafe).
