# Blueprint — the concrete pre-build commitment

The blueprint organ (renamed + repositioned from the old `document` organ). Authoritative procedure: [`skills/blueprint/SKILL.md`](../skills/blueprint/SKILL.md); this doc is the Claude-facing reference.

## What it is

A blueprint puts two things side by side so a competent engineer can see they're aligned and **commit**:

- **What we wanted** — the original intent (vision + spec).
- **What we're building now** — the *mature concrete* answer: classes, interfaces, dependencies, module/class relationships, build order.

It is **optional and post-planning** — reached for *after* `/draft-plan` when you want everything concretized in one place. It does **not** merge with `/draft-plan` (the plan stays the stepped *how*; the blueprint is the concrete *what*). It is the commit-point view, **not** a process narrative — how the plan was arrived at is out of scope.

```
envision → spec → draft-plan → [ blueprint ] → execute (blueprint optional)
```

## Two modes

- **Mode 1 (intent-driven, default):** reads `.claude/visions/<slug>/` + `.claude/specs/<slug>/` (+ the plan, optional). Where a source is silent, batches the gap into a single `AskUserQuestion` round; never invents.
- **Mode 2 (`--from-code`):** reads `.claude/codemap.md` + the codebase. Structural parts are reliable; behavioral (runtime-flow) diagrams are labelled `%% inferred — verify`.

## The three parts (omit empty)

1. **What we wanted (intent)** — 1–3 short paragraphs. No diagram. The comparand, not an essay.
2. **What we're building now (the concrete shape)** — the heart: a module/component map (`C4Container` + flowchart fallback), a `classDiagram` of the concrete types + relationships, a dependency graph + build order, and *optionally* key runtime flows (`sequenceDiagram`) + a data model (`classDiagram`/`erDiagram`).
3. **Alignment** — 2–4 lines: does the concrete shape still serve the intent? Name where it drifted/narrowed/added scope. The commit point. (A one-line key-decision note is the only concession to "why".)

## Output + gate

- **Review gate first**: present the drafted blueprint for accept/edit/reject before any write. No draft scratch file.
- **In-repo:** `.claude/docs/<slug>/v<N>.md` (versioned, supersedes chain, INDEX). **Vault:** `<Vault>/Projects/<ProjectFolder>/Docs/<slug>-blueprint.md` — `vaultRoot` read from `~/.claude/hook-config.json`, never hardcoded.

## What blueprint is not

- Not a step-by-step plan (`/draft-plan`), and does **not** merge with it.
- Not a process log — intent + mature shape only.
- Not `codemap-visualize` (which renders structure from finished code, post-hoc). Mode 2 overlaps its input but authors an *intent + shape + alignment* blueprint, not a raw index.
- Mermaid only; never auto-fires; never edits `hook-config.json`.

## Relationship to other organs

- **draft-plan** — upstream, no merge. **spec / vision** — the intent sources. **codemap-visualize** — opposite-direction sibling (renders finished code). **capture / decisions** — a key-decision note may wikilink a captured decision.
