# discover: reference

Read when the step you are on points here, or when something fails.

## What discover does NOT do

- Does not re-implement full ranking in-context as its primary path — see Architecture (§0).
- Does not auto-fire at SessionStart (future evolution, not v1).
- Does not cache results between invocations (stateless).
- Does not use embeddings or semantic search (string match only).
- Does not modify memory files (read-only).
- Does not suggest new tags for existing memories.
- Does not cross projects (only the current project's memory dir + global context already loaded).
- Does not *manage* the overlay (add/disable/edit rules) — that's the `rules` skill. Discover only *resolves* the tiers at read time; it never writes a manifest or rule file.

## Limits (v1)

This matching logic is **deliberately simple** — tag overlap + keyword match + escalation. The MCP engine (`mcps/project-memory/src/retrieval/score.ts`) is the live implementation; any scoring change lands in the engine first, then this spec is updated to match (the parity rule). Do not add recency weighting beyond recaps, AND/OR tuning, scope hierarchies, or precedence rules speculatively; embeddings / semantic search are an open future direction, not v1.

## Query interface (for other skills)

These filters map to the `mcp__project-memory__discover` parameters (§0), with two skill-side exceptions: `include_fallback` is resolved by this skill (the engine has no such parameter), and this skill passes `top_n` explicitly (default 8) rather than inheriting the engine's default (10) — the skill passes them straight through to the engine on the primary path, and uses them for the degraded deep-scan on the fallback path. When invoked by another skill rather than a user, accept these optional filters:

```
{
  task_keywords: string[],          // overrides the "last user message" extraction
  scopes: string[],                 // hard filter: only entries whose scope overlaps this
  kind: string | null,              // hard filter: only entries with this kind (e.g. "architectural-rule")
  relevance_phases: string[],       // hard filter: only entries matching at least one phase
  top_n: number,                    // default 8
  render_bodies: boolean,           // default false; when true, §9a invokes deliver and appends the rendered block
  include_fallback: boolean,        // default false; when true, include keyword-fallback matches in the delivered selection
  include_recaps: boolean           // default false; when false, §8a is skipped entirely
}
```

Return the report content as structured data rather than the prose template — the caller decides how to present. When `render_bodies: true`, also return the delivered block (per the deliver format contract) so the caller can splice it into working context.

More in [reference.md](reference.md): What discover does NOT do, limits (v1).

### 9a. Optional — render fragment bodies via deliver

When the caller passes `render_bodies: true` (programmatic invocation — prep, review, plan/execute), after producing the summary above, invoke [`skills/deliver/SKILL.md`](../deliver/SKILL.md) with the selected fragments and append its rendered block to the output under a `## Delivered fragments` heading.

User-invoked `/discover` does **not** pass `render_bodies: true` by default — the summary report stays concise. Bodies are pulled only when a consumer explicitly asks for them.

Construction of the `fragments[]` argument:
- Include the top high-confidence memories (those surviving §5 scoring, ordered by score descending).
- Include codemap entries from §8 if any (render as `kind: codemap`, path = file path, body = the codemap's section for that file).
- Skip "possibly relevant" (keyword-fallback) matches unless the caller passes `include_fallback: true`.
- For each memory fragment, Read the file body once and pass it verbatim — delivery does not re-read. Batch the Reads: independent files go in one message, not one call per turn.

The deliver skill enforces ordering, the 20-fragment cap, and the verbatim source-of-truth rule per its format contract.
