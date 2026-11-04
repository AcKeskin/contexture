# cycle: review mode

Read when the step that points here runs.

### Review (`/cycle review <pr> <folder>`, headless)

With `merge: on`, the loop starts this as its own session for each PR it published and for open PRs carrying `merge_label`, once per head commit. You review; the loop posts and merges.

1. Read `<folder>/pr.json`. Follow [review](../review/SKILL.md)'s `--pr` procedure for PR `<pr>`, read-only through `gh`, including its refuting verify pass. Skip its vault write and its pick prompt.
2. A finding is **blocking** when it is Critical or High and the verify pass confirmed it.
3. Write `<folder>/review.json`: `{ "verdict": "approve" | "changes", "summary": "...", "findings": [{ "severity", "file", "line", "claim", "blocking", "suggestion" }] }`. The verdict is `changes` when any finding is blocking, `approve` otherwise.
4. Write `<folder>/comment.md`, the one PR comment: first line `**Automated review (cycle)**`, then the summary and the findings with `file:line`, blocking ones first. Plain words, no other attribution.
5. Never edit, commit, push, approve, comment or merge yourself.

The loop then posts `comment.md` and merges only when every gate holds: an `approve` verdict, every check passes (it waits up to `merge_ci_wait_min`), no new commits since the review, and for its own runs the critic's approval (when `merge_needs_critic: yes` and the repo has a visual contract) and no open block card. A labeled PR also needs its label still on. Its own run with `changes` goes back to stage 4, up to `retry_cap` rounds; a labeled PR with `changes` only gets the comment.
