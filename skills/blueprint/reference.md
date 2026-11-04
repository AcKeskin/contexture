# blueprint: reference

Read when the step you are on points here, or when something fails.

## What blueprint does NOT do

- Does not implement anything — it pins the concrete shape; `/execute` builds it.
- Does not merge with `/draft-plan` — the plan stays the stepped plan; the blueprint is the optional concrete synthesis on top.
- Does not narrate *how* the plan was arrived at — process is out of scope; it shows intent + the mature concrete answer (a one-line key-decision note is the only concession).
- Does not render structure from finished code as its primary job — that's `visualise-codemap`. Mode 2 overlaps its input but produces an *authored* blueprint (intent + concrete shape + alignment), not a raw structural index.
- Does not use PlantUML/Graphviz. Mermaid only.
- Does not present Mode-2 inferred behavior as authoritative.
- Does not auto-fire. Manual, optional.
- Does not edit `hook-config.json`. Allowlist entries are user-owned.

## Relationship to other skills

- **visualise-codemap** — closest sibling, **opposite direction**. visualise-codemap *renders structure from finished code* (post-hoc, derived); blueprint *commits the concrete shape from intent* (pre-code). visualise-codemap shows what the code **is**; blueprint shows what it's **meant to be**. Reuses visualise-codemap's vault conventions, `<ProjectFolder>` inference, Mermaid-only limit, fan-out-cap discipline, and allowlist-surfacing.
- **draft-plan** — upstream, **no merge**. The plan is the stepped how; the blueprint is the optional concrete what. The review gate matches `draft-plan`'s.
- **spec / vision** — the intent sources (part 1). The spec is the authoritative Mode-1 input.
- **capture / `decisions/` memory** — a part-3 key-decision note may cross-link to a captured decision via an Obsidian wikilink.

## Limits (v1)

- Mermaid only. C4 emits a native block + a flowchart fallback (native C4 renders inconsistently across Obsidian versions; the flowchart is the reliable floor).
- Mode-2 behavioral inference is bounded by codemap's extraction quality (tree-sitter AST; regex only as a no-deps fallback) — inferred diagrams are labelled, never authoritative.
- Per-section vault split threshold and gap-batching granularity reuse visualise-codemap's config shape; tune with usage, do not add knobs speculatively.
- No incremental render — each run authors a full new version.
- In-repo output stays under `.claude/docs/<slug>/` (the design-artefact location) for v1; a dedicated `.claude/blueprints/` tree is a later option if blueprints and design docs need separating.
