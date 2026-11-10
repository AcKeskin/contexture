---
type: llm
---

PASS if the reply says `forEach` does not wait for the async callback, so `archiveJobs` returns before the inserts and deletes finish and `moved` is 0 (and errors are unhandled). A fix like `for...of` with `await` or `Promise.all` may be suggested.
FAIL if it misses that bug, or only lists style points.
