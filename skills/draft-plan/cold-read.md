# draft-plan: cold read

Used by `/draft-plan --cold` and by `/spec --cold` (lenses `comprehension` and `reuse` only).

8d. **Cold read (`--cold`, or `cold` at the gate).** The plan was written by a context that remembers everything; a reader who doesn't will find what it skipped. Dispatch three [`cold-reader`](../../agents/cold-reader.md) agents in one message, one per lens: `comprehension`, `readiness`, `reuse`. Each gets only the plan text verbatim, the repo root, and its lens. Never the conversation, never another agent's output.

   - **Sort each finding** as `fix`, `contest`, `escalate` or `skip` (nits only), per [review's pushback rules](../review/pushback.md).
   - **Show** the comprehension paraphrase first, then escalations, then the rest as `lens · severity · where · what · your call`. A wrong paraphrase is a finding even with no other findings.
   - **Apply** the `fix` rows the user accepts to the in-conversation draft, then return to the gate. One cold read per draft: after an edit, re-run only if the user asks.
   - **No Agent tool** → say the cold read did not run. Never role-play it in this context; that is not a cold read.
   - **Cost:** three agents. Worth it on plans that `/execute` will hand off (`[delegate]` steps or `--executor cheap`); say so once when the plan has neither.
