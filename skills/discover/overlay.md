# discover: overlay

Read at step 4a.

### 4a. Architectural-rule overlay resolution

When the candidate set includes `kind: architectural-rule` files — or the caller passed `kind: "architectural-rule"` (the prep / review path) — resolve them through the **tier-aware overlay** before scoring. This step is a no-op for memory / recap / codemap candidates; it only touches rule files.

The resolution algorithm (manifest precedence, tier walk, replace/patch modes, disables) lives in [`docs/architectural-rules-overlay.md`](../../docs/architectural-rules-overlay.md) § "Resolution algorithm (owned by discover)", implemented as the hook-callable `hooks/lib/resolve-rules.js` subroutine the rule-prime hook calls — same semantics, no model turn. Run it, then **strip `<!-- id: ... -->` anchors** from every resolved body — they are patch targets, never context (deliver also strips them, defense-in-depth). The surviving, stripped, patched files become the candidate set for §5 scoring. Carry per-file resolution metadata (winning tier, patch deltas, orphaned anchors, locked-divergence) into §9 so the report can annotate **non-default** rules only. If no manifest exists and no overlay dirs are present, this step resolves to "shipped tier only" — the overlay is inert until populated.

**Scope-resolution corpus source.** A resolver `corpus-source` from §6 selects *which corpus* the overlay walks: `submodule` → the submodule's own `<submodule>/.claude/architectural-rules/` layered as the most-local tier (above project, last-write-wins by relative path, per the [resolver merge order](../../docs/scope-resolution-resolver.md)); `parent` → the enclosing tiers scoped to the submodule's tags; `none` → **short-circuit: load no rules for this subtree**. Absent a resolver input → the standard tier walk, unchanged.
