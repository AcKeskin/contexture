# cycle: reference

Read when the step you are on points here, or when something fails.

## What cycle does NOT do

- **Not a verifier.** Review, tests and the project's capture tools judge the work.
- **Not a merger by default.** It ends at a pushed branch and a draft PR, and only when setup allowed it. It merges only with `merge: on`, through the review gate, and only its own PRs and PRs you labeled. Never pushes to the base branch, never force-pushes, never bypasses the repo's rules.
- **Not a taste judge.** Choices the project's design contract does not settle become cards.
- **Not a cross-project sweeper.** The audit reads this repo, prior art the user named, and a bounded online search.
- **Not silent about failure.** A parked or stuck slice leaves a note saying what it tried and why it stopped.

## Relationship to other organs

- **spec / draft-plan / execute / orchestrate / review / close-out / pr-author** — the stages it drives, through the gate map.
- **autonomize** — the baseline posture; the run's `contract.md` rows sit on top.
- **wrap** — the same driver pattern for a session's end.

## Jumping in (`/cycle <run>`)

The user can step in at any time without stopping anything:

- **Answer a card:** write the answer in the card file and set `status: resolved`. The next stage applies it.
- **Swap the slice:** before stage 2 starts, write another ranked id under `## Confirmed slice`.
- **Edit the plan or the audit:** the next stage reads the files as they are.
- **Stop:** `/cycle stop`. The current stage finishes, then the loop stops and says why in the digest.

When the user jumps in, show the run's stage table, its open cards and the last lines of its log, then make the edits they ask for. Never restart a stage from here; the loop owns that.

More in [reference.md](reference.md): What cycle does NOT do, relationship to other organs.
