---
name: human-view
description: Project an LLM-optimized planning artefact (a plan, blueprint, spec, or vision) into a human-readable approval view — the goal + the concrete decisions in plain prose, so you can approve it and check the discussions were pointing at the right thing. Callable by the draft-plan / blueprint review gates; also /human-view <artefact|slug> on demand. Extends two-doc-tracks to the working set. Mode A.
---

# human-view

The human-projection organ. Every planning artefact — `spec`, `draft-plan`, `blueprint`, `vision` — is written **token-optimized for the LLM**. At approval time the engineer needs the opposite: a **human-readable view of what's actually in the LLM's head**, to answer *"is this aligned with what I wanted, and were the discussions pointing at the right thing?"*

This is the README's **two-doc-tracks** principle (humans vs agents) — already applied to the *shipped corpus* (AGENTS.md/Copilot projections) — extended to the **working artefacts**. The LLM artefacts stay terse; this renders a human face **on demand**, the same projection pattern as `deliver` and the AGENTS.md projector. It does not bloat the source.

## When to run

- **Library call** (primary): the `draft-plan` and `blueprint` review gates invoke it to render the human view of the drafted artefact before the accept/edit/reject prompt. `spec` and `envision` may call it too.
- **`/human-view <artefact-path | slug>`** (thin command): render the human view of an existing artefact on demand — "show me the plan in human terms", "let me see what we actually decided".
- Mode A — never auto-fires; never writes the source artefact (read + project only).

## What it produces

A plain-prose **approval view** of the artefact, structured for a human scanning to approve, not an LLM executing:

1. **The goal, in one breath** — what this is trying to achieve, in plain language (from the artefact's intent/problem/goal).
2. **What we decided** — the concrete, load-bearing decisions as short prose bullets (the steps/shape/requirements that matter), *not* the token-compressed body. Translate IDs, refs, and shorthand into readable statements.
3. **Alignment check** — "does this match what you asked for?" — surface where the artefact narrowed, expanded, or reinterpreted the original ask, so a misalignment is visible *before* approval.
4. **Open questions / risks** — what's still unresolved or assumed, in plain terms.

Rendered inline in the conversation by default (the approval moment is conversational). On `/human-view... --vault`, also write a human copy to the Obsidian vault (reusing codemap-visualize's vault conventions + the `vaultRoot`-from-config rule, never hardcoded).

## Procedure

### 1. Resolve the artefact

- Library call: the caller passes the drafted artefact (in-conversation) + its type (plan/blueprint/spec/vision).
- `/human-view <path>`: read that file. `/human-view <slug>`: resolve the active artefact for the slug, preferring plan → blueprint → spec → vision (or ask if ambiguous).

### 2. Project to the human view

Read the artefact and render the four parts above. Rules:
- **Plain language.** Expand shorthand, IDs, and cross-refs into readable statements; a fresh reader (or the user a week later) should follow it without the source.
- **Decisions, not mechanics.** Surface *what was decided and why it matters*, not the file-by-file or step-by-step machinery (that's the LLM artefact's job).
- **Faithful, not creative.** This is a *projection* — never add decisions the artefact doesn't contain, never soften a risk. Same source-of-truth discipline as `deliver`.
- **Make misalignment visible.** Part 3 is the point: explicitly name where the artefact diverged from the original ask, even slightly.

### 3. Return / present

- Library call: return the rendered view to the caller, which shows it above its accept/edit/reject prompt.
- Command: present inline; `--vault` also writes `<Vault>/Projects/<ProjectFolder>/<type>s/<slug>-human.md`.

## What human-view does NOT do

- **Does not modify the source artefact.** Read + project only — the LLM artefact stays token-optimized.
- **Does not add or soften content.** Faithful projection; never invents decisions or hides risks.
- **Does not replace the artefact.** The plan/blueprint/spec stays the source of truth and the input to `/execute`; this is the human face for approval.
- **Does not auto-fire.** Library-called or user-invoked.

## Relationship to other organs

- **draft-plan / blueprint** — the primary callers; their review gates render this human view before asking accept/edit/reject ( gate + 067 projection).
- **deliver** — the sibling projector, opposite audience: `deliver` renders fragments *for the LLM*; human-view renders artefacts *for the human*. Same faithful-source-of-truth discipline.
- **the AGENTS.md projector / two-doc-tracks** — the same humans-vs-agents split, applied to working artefacts instead of the shipped corpus.
- **codemap-visualize** — shares the vault conventions + `vaultRoot`-from-config rule for the `--vault` copy.

See `.claude/specs/human-view/v1.md` for the design.
