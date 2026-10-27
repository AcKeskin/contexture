# Review pack (`--pack`)

A reviewer can't judge a change they don't understand. The pack explains the code under review so a person sees how it is built before deciding what to act on. Faithful and plain: nothing invented, no risk softened.

**Big picture for the human, mechanics for the model.** You read the raw code and follow the calls; the pack gives the person the shape, the numbers and the consequences. No code blocks except signatures and one short usage example in *Building on top*. `file:line` citations stay as small references.

**Source.** The review's target (PR diff + body + commits, `--since` diff, or the path). Read `.claude/codemap.md` when present for module deps, file deps and the call graph; otherwise read imports and call sites directly.

**Sections**, in order:

1. **What changed, in one breath** — what the code does now and why it changed (PR body or commits). For a path, what the code is for.
2. **Metrics** — the SKILL.md §5 metrics, each with its source.
3. **Structure** — the touched files' modules plus one hop of neighbours, as a mermaid flowchart with touched nodes highlighted. One line per touched file on its role.
4. **Call flow** — for the 1–3 main entry points the change touches, a mermaid `sequenceDiagram`. Static call order from the code, not a runtime trace; say so under it.
5. **Building on top** — public symbols added, changed or removed (with signatures), where to plug in a new case, a short usage example from real calls or tests (cited), and any breaking change for existing callers.
6. **Performance** — what runs per call, request, frame or item; loops over I/O; growth with input size; allocations or blocking on hot paths. Facts with `file:line`. Never guess timings; name the measurement that would settle it.

Every claim in 3–6 cites `file:line`. A section with nothing to say gets one line saying why (*"No public surface changed."*), never an empty heading.

**Output.** Shown inline before the decide view, and stored as `pack.sections` in the run's [findings.json](findings-schema.md), so the review page shows it as tabs and the vault note as sections.
