# review: report shape

Read at step 5, before writing the report.

Shape per the [review output contract](../../docs/review-output-contract.md); on divergence the contract wins. Header:

```
Review of: <target> (N files, M lines)        # PR: "PR #N: <title>", author, base <- head, +/-
Rules loaded: K | none                        Run mode: fresh | repeat (baseline v<N>, date)
Angles: correctness (12 files, 4) · performance (12, none) · security (failed)
Checks: ruff ok (2 findings) · tsc ok · dotnet build failed to start | none found
Metrics: change +412/-88 in 3 modules · blast radius 23 files · public surface +3/~1/-0 · tests 2 of 5
```

**Metrics** come from sources, never estimates: change size (`git diff --stat` / PR metadata), blast radius (files importing a touched file — codemap File deps, else grep), public surface (codemap exports, else the diff; for a path target, exported symbols in scope), tests (changed source files some test reaches, from `node ../update-codemap/affected-tests.mjs --base <base>` on the codemap, listing its `untested` files; no codemap → changed source files with a changed test; for a path target, source files with a test), plus angle metrics such as calls added to the request path. Each names its source.

The Metrics line is never skipped; a metric with no source shows `n/a (<why>)`.

Then: Orientation (2c) → Severity × Category matrix (category = drift check or angle) → mandatory diagram (contract §2: flowchart for boundary findings, split sketch, sequence for ordering bugs, ASCII bar chart for many small findings, or a one-line N/A with the why) → per-file findings (severity-first locally, line-ascending on a PR) → findings table → quick wins → Tensions → Needs validation → resolved/carried (repeat runs) → looks bad but actually fine (≥2, contract §4). Files with no findings render as one line. PR targets end with `Verdict: APPROVE | REQUEST_CHANGES | COMMENT` and a 1–2 sentence reason; only confirmed Critical/High drive `REQUEST_CHANGES`. Zero findings → *"No findings."* (+ `Verdict: APPROVE` on a PR), still with the diagram line and looks-bad-but-fine.

**Questions sit on their finding.** A question only the author can answer (intent, a timezone, a caller outside the repo) goes in that finding's `question` and shows with it. No closing "questions for the author" list: it turns the review into homework. A question with no finding becomes a Needs validation row with its `file:line`, or is dropped. From `anthropics/skills` discernment-nudge (read 2026-11-08).
