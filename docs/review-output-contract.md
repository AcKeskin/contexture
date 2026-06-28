# Review output contract

The shared output shape for every review-flavoured skill — [`review`](../skills/review/SKILL.md), [`pr-review`](../skills/pr-review/SKILL.md), and any future `security-review`. This doc is the authority; the consuming skills cite it, they do not restate it.

## What the contract owns

The **presentation shape of findings**: grouping order, when diagrams are required, when GitHub `suggestion` blocks are required, and the supporting views (findings table, quick wins, looks-bad-but-fine). It does **not** own *what counts as a finding* (each skill's review categories own that), *whether to apply fixes* (the skill's propose-confirm loop owns that), or *where the artefact is persisted* (each skill owns its own persistence).

Three skills produced three slightly-different shapes and the same two affordances (diagrams, suggestion blocks) were missing across all of them. Inlining the same augmentation three times is the smell. This contract is that augmentation, written once.

| Concern | Source | What the contract does | | --- | --- | --- | | What is a finding | each skill's review categories | Assumes findings already collected | | Whether to apply a fix | each skill's propose-confirm loop | Untouched — contract is presentation only | | Where the artefact lives | each skill's persistence section | Untouched — contract shapes the body, not the path | | `file:line` citation rule | 005 v2 aug B / 030 §6 | Reaffirms it; a finding without `file:line` is not a finding | ## 1. File-then-severity grouping (primary)

Findings render **file-grouped, severity-ordered within each file**. This is the natural reviewer reading order — a reviewer works file by file, and within a file the highest-severity issue dictates whether the file is acceptable.

```
## <file/path/here.ext>

 [Critical / S] <Category> — <one-line gist>
 Lines: <line range>
 <Description>
 Recommendation:
 <prose, OR a suggestion block when §3 applies>

 [High / M] <Category> — <one-line gist>
 Lines: <line range>
...

## <next file>
...
```

- Severity sort key within a file: **Critical → High → Medium → Low**. Effort suffix (`S`/`M`/`L`) is informational, not a sort key.
- A finding that spans multiple files appears under the **primary** file (the changed file for pr-review; the importer for working-tree review) with cross-references in the recommendation.
- Files with zero findings still render as `## <path> — no findings` (one line) so the reviewer can confirm the file was scanned, not skipped.
- The category-grouped view (all SoC violations across the run, etc.) is a permitted **secondary** view. File-grouped is primary; category-grouped is optional supplementary. The Severity × Category roll-up matrix (§5) carries the category-level signal.

## 2. Diagrams — required when structural

A diagram is **part of a finding's content**, not decoration. A structural finding without a diagram is incomplete and is rejected the same way a finding without `file:line` is rejected.

**Required** when the finding's content is structural:

- Module / layer boundary violations (which file imports what, across which boundary).
- Monolith-split recommendations (current shape vs proposed shape).
- Dependency cycles or near-cycles.
- Refactor sketches that change the call graph.

**Optional** for everything else (a local bug, a dead export, a renamed value).

Heuristic for "is this structural?":

| Finding mentions… | Diagram | | --- | --- | | module / layer / boundary / imports / depends on | **required** | | split / extract / refactor structure / decompose | **required** | | rename / remove / value / literal / guard / null-check | optional | **Formats — preference order: mermaid > ASCII box-drawing > ASCII bar chart > N/A justification.**

- **Mermaid** — preferred for graph-shaped or larger structures; renders natively on GitHub. Wrap in a ` ```mermaid ` fence.
- **ASCII box-drawing** — preferred when the diagram is small (≤10 nodes, ≤15 edges) and inline scannability matters; copies cleanly into any terminal or PR comment.
- **N/A** — only when the scope genuinely has no structural angle (single-file leaf utility, <3 findings). Must state the why on one line: `Diagram: N/A — single-file scope with no cross-module structure to visualise.` An empty diagram slot without a justification is treated as incompleteness.

When mermaid is used, precede it with a **one-line ASCII fallback** so the terminal reader (who sees the output before GitHub renders it) still gets the gist:

````
 Current shape:
 [components] ──► [/api] (violation)

 ```mermaid
 flowchart LR
 components -- direct fetch --> api[/api/orders]
 services -.-> api
 classDef bad fill:#fdd,stroke:#900;
 class components,api bad
 ```
````

## 3. Suggestion blocks — required when the fix fits

When a recommendation is a concrete code change, express it as a GitHub ` ```suggestion ` block **when all four conditions hold**:

1. The recommendation **is a concrete code change** (not "consider restructuring").
2. The change is **≤10 lines** in the resulting code.
3. The change is **localised** — same file, contiguous line range.
4. The change is **mechanically actionable** — no "you'll also need to update X elsewhere" caveats.

All four hold → the recommendation **must** be a suggestion block:

````
 Recommendation:
 ```suggestion
 const expiry = parseExpiry(token.exp);
 ```
````

Any condition fails (bigger than 10 lines, spans files, has caveats, or is a judgment-call structural change) → **prose recommendation is correct**. The contract does not force suggestion blocks onto findings that don't fit; forcing them produces unappliable garbage.

**Content rules for the block:**

- The block contains the **replacement** for the cited line range — the literal lines that should be there. Not a diff, not a full file.
- The block content **matches the cited file's indentation** (tabs vs spaces, indent depth). The skill reads the cited lines, detects the style, and applies the same. A block that doesn't match the file's whitespace is rejected at emit time — `gh` silently drops a suggestion whose whitespace doesn't line up.
- **No explanatory comments inside the block** — the "what changed and why" goes in the prose above it. The block is only the code that should land.
- The skill must cite the **correct range** — sometimes wider than the literal changed line, because GitHub applies a suggestion as a line-range replacement. If extracting a helper changes the surrounding indent, the cited range must cover the lines whose indent changes.

**Why this is the highest-leverage format:** on GitHub a `suggestion` block renders as a one-click "Apply suggestion" button — reviewer effort ≈ writing prose, reviewee effort ≈ zero. The reviewee applies the fix straight from the PR thread with no retyping. A finding whose fix fits the four conditions but is written as prose loses that one-click apply.

## 4. "Looks bad but actually fine" section

Structurally required for every consumer. Enumerate **≥2–3 near-misses** with reasoning — things the skill considered flagging and deliberately did not, with the why. This is the evidence the analysis was thorough rather than shallow.

- This section is **not** file-grouped — it's a flat list at the end, since the entries aren't action items.
- If scope is genuinely too narrow to surface near-misses (1–2 files), report that with a one-line justification. An empty section **without** the justification is treated as incompleteness, not "nothing to flag."

## 5. Findings table (secondary view)

The at-a-glance view alongside the file-grouped sections. Always present when total findings > 0.

Columns: `ID | Category | File:Line | Severity | Effort | Description` (+ optional one-line Recommendation). Each row's ID matches the per-file bullet's ID. The table is uncapped within the run-wide ceiling; the per-file bullets may cap at top-N for readability, but the table mirrors all findings.

The table is the **scan** view; the file-grouped sections are the **read-in-order** view. Both exist by design.

## 6. Quick wins checklist

Low effort × Medium+ severity findings, rendered as a checklist after the table. Always present — when no finding qualifies, render the section with an explicit one-liner (`None — no Low-effort × Medium+-severity findings in this run`) rather than omitting it.

## What this is not

- **Not a new skill, not a slash command.** A doc consumed by skills.
- **Not a runtime-enforced linter.** It is a skill-design rule. Drift is caught by the user reading the output, not by automated validation.
- **Not a backward-incompatibility forcing function.** The category-grouped view stays available as secondary; what changed is what's *primary*.
- **Not exhaustive.** Two affordances (diagrams + suggestion blocks) in v1. Severity heatmaps, link previews, cross-file dependency tables can be added later if they earn their place.

## Consumers

| Skill | How it consumes | | --- | --- | | [`review`](../skills/review/SKILL.md) | File-primary grouping (already), diagrams (already, §5b), findings table + quick wins + looks-bad-but-fine (already). **New from this contract:** suggestion blocks per §3 in the propose-fix recommendations. | | [`pr-review`](../skills/pr-review/SKILL.md) | File-grouped + severity-sorted (already), mandatory diagram (already, §10), file:line gate (already), summary matrix + key-findings table + checklist (already). **New from this contract:** suggestion blocks per §3, replacing freeform `Suggestion:` prose where the four conditions hold. | | future `security-review` | Hard input from day one — security fixes are overwhelmingly ≤10-line localised changes, so suggestion blocks apply heavily. | The two skills already implemented ~80% of this shape independently. The contract's job is to (a) stop the shape being re-derived per skill, and (b) add the one affordance neither had — suggestion blocks — which is what makes the 041 round-trip pay off.
