---
retry_cap: 3
---
# Run contract

Edit this file for the run. `cycle-state check` reads the completion items; the stages read the escalation rows and the retry cap.

## Escalation

Each row is `block` (park the slice with a note; the loop moves to the next one) or `card` (write a decision card with a default and keep going on work that does not depend on it). The user answers cards whenever they like; the next stage reads the answer.

| Trigger | Action |
|---|---|
| Setup gap (tool, path, write scope) | block |
| Irreversible or outward action beyond the loop config (publish, delete, migrate data) | block |
| Architecture fork the spec does not settle | block |
| Retry cap hit, or the same failure fingerprint 3 times | block |
| Spec ambiguity with more than one reading | card |
| Scope growth beyond the confirmed slice | card |
| Taste-call the project's design contract does not settle | card |
| Low confidence the change meets the completion items | card |

## Completion items

Each item needs evidence before finalize: a command and an excerpt of its output, or a file path.

- id: criteria
  item: Every done-criterion of the slice's spec is met
  evidence:
- id: tests
  item: The project's test command passes
  evidence:
- id: review
  item: Review findings are fixed or written up as cards
  evidence:
- id: visual
  item: Declared captures taken before and after the change, or "no UI"
  evidence:
- id: staged-by-name
  item: Only the slice's files are staged; no tool-generated noise
  evidence:
