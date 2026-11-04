# draft-plan: reference

## Spec pinning

A plan's `spec:` frontmatter pins the exact spec version it was drafted against. If the spec evolves to a higher version after the plan is written, the plan does NOT silently update — it stays pinned. This is deliberate: a plan reflects decisions made against a specific spec snapshot. To rebuild the plan against a newer spec, run `/draft-plan <slug>` again, which produces a new plan version pinned to the new spec version.

## What /draft-plan does not do

- Does not implement anything.
- Does not run `/execute`.
- Does not modify spec files.
- Does not silently overwrite an existing plan version. Every write creates a new `v<N>.md`.
- Does not write the plan without confirmation. The review gate (step 9) presents the drafted plan and waits for *accept* before anything lands on disk — no silent write, no draft scratch file.

See also: [`docs/plan-execute-workflow.md`](../../docs/plan-execute-workflow.md).
