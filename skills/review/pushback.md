# Pushing back on a finding

Shared by review (walk, `wontfix`), draft-plan and spec (cold read), and pr-triage.

These rules apply whenever you argue a finding is wrong: in a walk, a `wontfix` reason, or a cold read for `spec` or `draft-plan`.

- **Contest only with evidence the reviewer could read:** a `path:line`, a symbol, or a line in the doc under review. "This was intentional" is not evidence.
- **Escalate when the evidence is out of reach.** A team convention, a verbal decision or an outside constraint goes to the user as `escalate`, with the fact stated. Do not fix it and do not drop it.
- **Do not argue down a comprehension gap.** If a fresh reader got lost, the text is missing context.
- **Add text for human readers only.** If only a no-context agent needs it, escalate instead of padding the doc.
- **Never change severity to win.** Contest it and say why.
