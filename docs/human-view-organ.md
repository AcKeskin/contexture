# Human-view — the approval projection

Authoritative procedure: [`skills/human-view/SKILL.md`](../skills/human-view/SKILL.md); this doc is the Claude-facing reference.

## What it is

Every planning artefact (`spec`, `draft-plan`, `blueprint`, `vision`) is written **token-optimized for the LLM**. At approval time the engineer needs the opposite: a **human-readable view of what's actually in the LLM's head**, to answer *"is this aligned with what I wanted, and were the discussions pointing at the right thing?"*

This is the README's **two-doc-tracks** principle (humans vs agents) — already applied to the *shipped corpus* (AGENTS.md/Copilot projections) — extended to the **working artefacts**. The LLM artefacts stay terse; this renders a human face **on demand**, the same projection pattern as `deliver` and the AGENTS.md projector.

## What it produces

A plain-prose **approval view** in four parts:

1. **The goal, in one breath** — plain language, from the artefact's intent/problem/goal.
2. **What we decided** — the concrete load-bearing decisions as short prose bullets; shorthand/IDs/refs translated into readable statements.
3. **Alignment check** — *the point:* where the artefact narrowed, expanded, or reinterpreted the original ask, so a misalignment is visible *before* approval.
4. **Open questions / risks** — in plain terms.

Rendered inline by default; `/human-view … --vault` also writes a human copy (`vaultRoot` from config, never hardcoded).

## How it's used

- **Library call (primary):** the `draft-plan` + `blueprint` review gates invoke it to render the human view before the accept/edit/reject prompt.
- **`/human-view <slug | path>`:** on demand — "show me the plan in human terms".

## What human-view is not

- Does not modify the source artefact (read + project only). Does not add or soften content — a **faithful** projection (the `deliver` discipline), never invents decisions or hides risks. Does not replace the artefact (it stays the source of truth + `/execute` input). Does not auto-fire.

## Relationship to other organs

- **draft-plan / blueprint** — the primary callers ( gate + this projection). **deliver** — sibling projector, opposite audience (deliver renders *for the LLM*; human-view renders *for the human*). **AGENTS.md projector / two-doc-tracks** — same humans-vs-agents split, applied to working artefacts. **codemap-visualize** — shares the vault conventions for `--vault`.
