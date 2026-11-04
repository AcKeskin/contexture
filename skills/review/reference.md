# review: reference

Not needed during a run.

## Failure modes

- `gh` missing / unauthenticated, no GitHub remote, PR not found, network error → bail with the exact fix or the `gh` error verbatim.
- Empty PR diff → *"PR #N has no file changes."*
- Scope over the guard and the user proceeds → flag the context cost in the summary.
- Zero rules on a local run → rule-free checks only, stated in the header.

## What review does NOT do

- **Does not auto-fire**, post to GitHub, check out PR branches, or run tests.
- **Does not replace a linter.** Security goes deeper with `security-reviewer`; fit-and-intent is `checkpoint`; bug-hunting your own diff is the built-in `code-review`.
- **Does not apply fixes silently** or on a PR target.
- **Does not settle tensions** — it shows both sides and what would decide.
- **Does not spawn agents without `--angles`.**
- **Does not track findings actively** — the persisted artefacts are read only by the next run.

## Relationship to other organs

- **discover / deliver** — rule retrieval and rendering. **capture** — feedback-loop writeback. **prep** — primes before writing; review detects after.
- **retrospect-core** — the same orient / baseline / render / persist ideas, generalised for checkpoint. When one changes, check the other.
- **human-view** — the plan-side projection; the code-side pack lives here in [pack.md](pack.md).
- **security-reviewer** — verifier for security findings. **pr-triage / pre-push / pr-author** — the reviewee side of a PR.

See [`docs/review-organ.md`](../../docs/review-organ.md) for rationale.
