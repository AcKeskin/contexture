---
name: discover
description: Load relevant stored memories and codemap entries for the current task. Use when the user types /discover, asks to "prep" or "load context," or any time the current task is about to start and stored context has not been surfaced yet. Also callable by other skills (prep, review) that need to query stored context programmatically.
---

# discover

Unified retrieval layer. Aggregates stored memory fragments (what we've decided/learned) and codebase context (what the code actually looks like) into the current session.

## When to run

- User types `/discover` (explicit trigger).
- User says "load context," "prep yourself," "what do you know about X."
- Another skill invokes this one (prep, review).
- Do **not** auto-fire at session start — explicit invocation only.

## Inputs

1. **Task text.** The most recent user message, plus any arguments passed after `/discover`.
2. **Project root.** `$CLAUDE_PROJECT_DIR` if set, otherwise the current working directory.
3. **Optional caller filters** (when invoked by another skill, not by a user): `scopes`, `kind`, `relevance_phases`. See "Query interface" below.

## Architecture — MCP-primary, skill-fallback

Per the retrieval vision (`.claude/visions/retrieval/v1.md`, which settled retrieval as **MCP-primary**), memory + recap + codemap retrieval is owned by the **`project-memory` MCP engine**, out of context. This skill is a **thin client** over it, with a **static always-on floor** when the engine is unreachable.

Two responsibilities stay in this skill, NOT the MCP (vision boundary):
- **Rules-overlay resolution (§4a)** — the 047 tier/patch/disable subsystem is a separate module; v1 keeps it skill-resident.
- **The fallback** — when the MCP is down, surface the static floor (§0b). The skill does **not** re-implement the full ranking as its primary path.

### 0. Primary path — query the MCP engine

Call `mcp__project-memory__discover` with the task-derived query:

```
mcp__project-memory__discover({
 cwd: <project root>, // the engine resolves the layered tier
 task_keywords: [...], // §3 extraction
 scopes: [...], // §6 inference
 relevance_phases: [...], // current phase, if any
 kind: <filter or omit>,
 top_n: 8,
 render_bodies: <true for programmatic callers, false for user /discover>,
 include_recaps: <caller pref, default false>,
 include_codemap: true,
})
```

The engine returns ranked memory fragments (with `📛` warning prefixes, `[related_to]` / `⚡ contradicts` flags, scope/relevance metadata), plus a `## Codemap` block, plus any `⚠️` shadowed-tier / case-split warnings. Surface that result directly (§9 shaping is mostly done by the engine). Then run §4a (rules-overlay) and merge.

**Detecting MCP-unavailable:** the tool call errors, returns "No memory tree found" with no result, or the `project-memory` server is not connected. On any of these → fall through to §0b. Do not retry in a loop.

### 0b. Fallback — static always-on floor

When the engine is unreachable, do **not** silently re-run the full in-context scan as if nothing happened. Surface the **static floor** and say the engine is down:

1. Read `~/.claude/projects/<slug>/memory/MEMORY.md` (the fallback index).
2. Surface only the `relevance: always` entries (the load-bearing always-applicable set) plus any `kind: warning` entries whose scope plausibly matches the task.
3. Tell the user: *"project-memory MCP unavailable — showing the always-on floor only; ranked retrieval resumes when the MCP reconnects (restart the session or `/mcp reconnect`)."*

The richer in-context scan (§1–§9 below) remains documented as the **degraded deep-scan** the skill MAY run if the user explicitly asks for full retrieval while the MCP is down — but it is not the default fallback. Default fallback = the cheap static floor.

---

## Procedure (degraded deep-scan / reference contract)

*The steps below are the full in-context algorithm. They are (a) the contract the MCP engine implements, kept here as the spec of record, and (b) the deep-scan the skill runs only on explicit request when the MCP is down. The MCP-primary path (§0) supersedes them for normal operation.*

### 1. Resolve the project memory directory

Use Glob to find: `~/.claude/projects/*/memory/MEMORY.md`.

Pick the match whose path contains the project root directory name (case-insensitive, separator-insensitive).

If no match → report "no project memory found for <cwd>" and proceed with whatever global context is already loaded via `~/.claude/CLAUDE.md`. Do not try to derive the slug manually — Claude Code's slug convention is not documented and attempts to reconstruct it are fragile.

### 2. Read MEMORY.md

Read the full file. It is the index: one line per entry, format `- [Title](path) — one-line hook`.

### 3. Extract task keywords

From the task text plus any `/discover` arguments, extract keywords:
- Lowercase, split on whitespace and punctuation.
- Drop common stopwords (`the`, `a`, `an`, `to`, `of`, `and`, `or`, `is`, `for`, `with`, `from`, `on`, `in`, `at`, `by`, `as`, `this`, `that`, `it`, `i`, `you`).
- Keep nouns, verbs, names. Keep technical terms even if short (`api`, `jwt`, `ui`).

### 4. Score candidates from the index

For each MEMORY.md entry, compute a first-pass score:
- `keywords_hit` = count of task keywords appearing in the title or hook.
- If `keywords_hit == 0` and the entry is not tagged `relevance: always` (unknown at this stage — flag for second pass), drop from primary candidates.

Keep entries with `keywords_hit ≥ 1` as **primary candidates**.

### 4a. Architectural-rule overlay resolution

When the candidate set includes `kind: architectural-rule` files — or the caller passed `kind: "architectural-rule"` (the prep / review path) — resolve them through the **tier-aware overlay** before scoring. This step is a no-op for memory / recap / codemap candidates; it only touches rule files.

Full algorithm in [`docs/architectural-rules-overlay.md`](../../docs/architectural-rules-overlay.md) § Resolution (also implemented as the hook-callable `hooks/lib/resolve-rules.js` subroutine the rule-prime hook calls — same semantics, no model turn). Summary:

1. Read manifests: `~/.claude/architectural-rules.config.yaml` (user), then `<project-root>/.claude/rules.config.yaml` (project), then any in-context session disables. Most-local wins.
2. Enumerate rule files across enabled tiers, in precedence order (low → high): `~/.claude/architectural-rules/` (shipped) → `~/.claude/architectural-rules-company/` → `~/.claude/architectural-rules-local/` → `<project-root>/.claude/rules/`.
3. Resolve each `<scope>/<name>` key, highest tier down:
 - `mode: replace` or no `override:` → keep the highest-tier file, drop the shadowed ones.
 - `mode: patch` (frontmatter has `override: <key>`) → load the lower-tier body, apply its `## remove` / `## replace` / `## add` deltas anchored on bullet `id`s (the `<!-- id:... -->` prefixes), falling back to exact-text match. An anchor that matches nothing loads the base **un-patched** and is flagged.
4. Drop any key disabled at global / project / session scope.
5. **Strip `<!-- id:... -->` anchors** from every resolved body — they are patch targets, never context. (Deliver also strips them, defense-in-depth.)
6. The surviving, stripped, patched files become the candidate set for §5 scoring below.

Carry per-file resolution metadata (winning tier, patch deltas, orphaned anchors, locked-divergence) into §9 so the report can annotate **non-default** rules only.

If no manifest exists and no overlay dirs are present, this step resolves to "shipped tier only" — identical to pre-047 behaviour. The overlay is inert until populated.

**Scope-resolution corpus source.** When a resolver `corpus-source` arrived from §6, it selects *which corpus* this overlay walks, before the tier resolution above: `submodule` → enumerate the active submodule's own `<submodule>/.claude/architectural-rules/` (in addition to / over the parent tiers per `inherit-parent`); `parent` → the enclosing tiers as normal, scoped to the submodule's tags; `none` → **short-circuit: load no rules for this subtree** (an out-of-discipline / vendored region). The submodule corpus layers as the most-local tier (above project), last-write-wins by relative path, per the [resolver merge order](../../docs/scope-resolution-resolver.md). Absent a resolver input → the standard tier walk above, unchanged.

### 5. Read frontmatter of primary candidates

For each primary candidate, Read the file and parse frontmatter. Extract `scope`, `relevance`, `kind`, `relations`, `superseded_by`.

**Suppress superseded memories.** If `superseded_by:` is set, drop the candidate from the surfaced set unless the caller passed it by explicit name (e.g. `task_keywords` includes the candidate's `name` field exactly). This keeps superseded entries inspectable when asked for, hidden from normal discovery.

Compute a second-pass score per candidate:
- `+2 × |task_scopes ∩ scope|` (tag overlap is the strongest signal; task_scopes come from keyword → scope guess, see §6)
- `+1` if `relevance` includes `always`, or matches the current phase
- `+1 × keywords_hit` (already computed)
- `+2` if `kind == "warning"` (warnings are landmines — surface them ahead of generic lessons when scope matches)

If a caller passed `scopes` / `kind` / `relevance_phases` filters, apply them as hard filters (drop non-matching entries) before scoring.

Sort candidates by score descending. Keep top 8. Cap adjustable by caller.

### 5a. Single-hop relation expansion

For each candidate that survived §5 scoring, follow its `relations:` entries one hop. Pull in the targets and add them to the surfaced set, but with adjusted handling per relation type:

- **`supersedes`** — already filtered out by the §5 superseded suppression; do not re-pull the target.
- **`contradicts`** — pull the target into the surfaced set even if it didn't independently match. Mark the pair with a `[contradicts]` flag in the report so the user sees the conflict and can resolve.
- **`supports`** — if the target is already in the surfaced set, bump its score by `+1` (the source corroborates it). If the target is not in the set, do *not* pull it in — `supports` is a weight bonus, not a magnet.
- **`related_to`** — soft pointer. Pull the target into the surfaced set with a `[related_to <source>]` flag in the report so the user knows why it surfaced. Do not transitively expand — single-hop only.

Cap relation-pulled additions at 3 per source candidate to prevent runaway expansion when one entry has many related-to links. If more than 3 candidates apply, keep the first 3 by `relations` order and note `[N more relations not expanded]` in the report.

After 5a, re-sort the surfaced set by score (relation-pulled entries take their source's score minus 1 unless they had their own §5 score, in which case the higher of the two).

### 6. Inferring task scopes

**Resolver-provided scopes are hard inputs (scope-resolution, 035+037).** When the caller (prep) ran the [scope-resolution resolver](../../docs/scope-resolution-resolver.md) for the task path, its resolved scopes + `corpus-source` arrive as a prior: treat the resolved scopes as **hard scope inputs** (a task under a `go` submodule carries the `go`/region scopes, not the sibling region's), and honor the `corpus-source` in §4a (below). **Absent manifests → no resolver input → infer scopes exactly as below (no regression).**

From the task text, infer candidate scope tags (seeded by any resolver-provided scopes):
- Strong hints: filenames or module names mentioned (`src/auth/` → scope `auth`).
- Medium hints: domain words (`login`, `password`, `session` → scope `auth`).
- Fall back to `[global]` only if nothing specific surfaces.

Use discovered scopes as the matching set in §5. When uncertain, include `[global]` so universally-scoped entries are never excluded.

### 7. Keyword fallback (only if §4–§5 returns thin)

If fewer than 2 entries survive with a score ≥ 2, widen:
- Grep the body of every memory file for task keywords.
- Any file with ≥ 2 keyword hits is a low-confidence match.
- Flag these as "possibly relevant" in the report, separate from the high-confidence matches.

### 8. Read the codemap (if present)

Check `<project-root>/.claude/codemap.md`. If missing, skip §8 silently ( may not have landed in this project yet).

If present:
- Read and identify files/exports matching the inferred scopes and task keywords.
- Note the codemap's last-modified timestamp.

### 8a. Scan session recaps

Path: `<memory-root>/sessions/` (the project memory resolved in §1).

Skip silently if the folder does not exist — the project may have no recaps yet.

Scan filenames matching `YYYY-MM-DD-<slug>.md`. Parse the date.

Apply the **30-day auto-surface cutoff**:

- Recaps with `date` within the last 30 days are auto-candidates.
- Older recaps are candidates only if the task text explicitly names a matching project slug, branch, or date (e.g. "the auth branch from March", "last week's recap"). When the task text does not name such an anchor, skip them.

For each surviving recap, Read frontmatter. Score:

- `+2 × |task_scopes ∩ scope|` — scope overlap (same weight as other candidates).
- `+1 × keywords_hit` on `name` / `description`. Also scan the `Learned` section headings for bonus keyword hits.
- **Recency bonus:** `+2` if `date` is within 7 days; `+1` if 8–30 days.

Include scored recaps alongside memories and codemap as §9 candidates. They render as their own category ("Session recaps:") in the summary report and, when bodies are rendered (§9a), deliver as tier `session-recap`.

Callers can opt out via `include_recaps: false` in the query interface.

### 9. Report

Report to the user in this shape:

```
Loaded N memories + R recaps + M codemap entries (codemap age: X days):
 Memories (high confidence):
 - 📛 [Warning Title] (scope: <tags>, relevance: <phase>) ← warnings prefixed and listed first
 - [Title] (scope: <tags>, relevance: <phase>)
 - [Title] [related_to <source>] (scope: <tags>, relevance: <phase>)
 - [Title-A] ⚡ contradicts [Title-B] (both surfaced — needs reconciliation)
 -...
 Memories (possibly relevant):
 - [Title] (scope: <tags>, relevance: <phase>)
 -...
 Session recaps:
 - [Title] (date: <YYYY-MM-DD>, scope: <tags>)
 -...
 Codemap:
 - path — summary
 -...

No stored context found for: [list of task aspects with no matches].
Want to provide context, or should I proceed with what I have?
```

Display rules:
- `kind: warning` entries get the `📛` prefix and appear at the top of their tier.
- `[related_to <source>]` annotations explain why a fragment surfaced via single-hop expansion (the user can tell direct match from relation pull at a glance).
- `⚡ contradicts <other>` flags pairs where the user needs to reconcile two memories that disagree.

Overlay annotations (architectural-rule candidates only) — **non-default rules only**, a plain shipped rule shows nothing extra:
- `[company override]` / `[user override]` — a higher tier replaced the shipped file.
- `[user patch over shipped (−1 ~1 +1)]` — a field patch applied, with delta counts.
- `[⚠ orphaned patch anchor]` — a patch referenced an id that no longer exists; base loaded un-patched.
- `[⚠ override of LOCKED company rule]` — the user diverged from a locked company rule (divergence recorded).

Sections are omitted when empty. If nothing matched at all, say so and go to §10.

### 9a. Optional — render fragment bodies via deliver

When the caller passes `render_bodies: true` (programmatic invocation — prep, review, plan/execute), after producing the summary above, invoke [`skills/deliver/SKILL.md`](../deliver/SKILL.md) with the selected fragments and append its rendered block to the output under a `## Delivered fragments` heading.

User-invoked `/discover` does **not** pass `render_bodies: true` by default — the summary report stays concise. Bodies are pulled only when a consumer explicitly asks for them.

Construction of the `fragments[]` argument:
- Include the top high-confidence memories (those surviving §5 scoring, ordered by score descending).
- Include codemap entries from §8 if any (render as `kind: codemap`, path = file path, body = the codemap's section for that file).
- Skip "possibly relevant" (keyword-fallback) matches unless the caller passes `include_fallback: true`.
- For each memory fragment, Read the file body once and pass it verbatim — delivery does not re-read.

The deliver skill enforces ordering, the 20-fragment cap, and the verbatim source-of-truth rule.

### 10. Escalate when coverage is thin

Thin = any of:
- Zero high-confidence memory matches **and** zero codemap matches.
- The task names specific aspects that no match addressed (e.g., user asked about "payment gateway webhooks" and nothing in memory or codemap mentions payment).
- Claude's own judgment: "I'm about to guess."

Escalation shape: ask **up to 3** targeted, numbered questions. Each names the specific gap.

```
Before I proceed, I need clarity on:
1. [specific gap — phrased as a question]
2. [specific gap]
3. [specific gap]
```

Do not ask generic questions ("tell me more about X"). Each question must identify a specific piece of missing context.

## Query interface (for other skills)

These filters map 1:1 to the `mcp__project-memory__discover` parameters (§0) — the skill passes them straight through to the engine on the primary path, and uses them for the degraded deep-scan on the fallback path. When invoked by another skill rather than a user, accept these optional filters:

```
{
 task_keywords: string[], // overrides the "last user message" extraction
 scopes: string[], // hard filter: only entries whose scope overlaps this
 kind: string | null, // hard filter: only entries with this kind (e.g. "architectural-rule")
 relevance_phases: string[], // hard filter: only entries matching at least one phase
 top_n: number, // default 8
 render_bodies: boolean, // default false; when true, §9a invokes deliver and appends the rendered block
 include_fallback: boolean, // default false; when true, include keyword-fallback matches in the delivered selection
 include_recaps: boolean // default true; when false, §8a is skipped entirely
}
```

Return the report content as structured data rather than the prose template — the caller decides how to present. When `render_bodies: true`, also return the delivered block ( format) so the caller can splice it into working context.

## What discover does NOT do

- Does not re-implement full ranking in-context as its primary path — the MCP engine owns scoring (§0). The in-context scan is the engine's contract-of-record + an explicit-request deep-scan only.
- Does not auto-fire at SessionStart (future evolution, not v1).
- Does not cache results between invocations (stateless).
- Does not use embeddings or semantic search (string match only).
- Does not modify memory files (read-only).
- Does not suggest new tags for existing memories.
- Does not cross projects (only the current project's memory dir + global context already loaded).
- Does not *manage* the overlay (add/disable/edit rules) — that's the `rules` skill. Discover only *resolves* the tiers at read time; it never writes a manifest or rule file.

## Limits (v1)

This matching logic is **deliberately simple** — tag overlap + keyword match + escalation. The MCP engine (`mcps/project-memory/src/retrieval/score.ts`) is the live implementation; this document is its contract-of-record. Any scoring change lands in the engine first, then this spec is updated to match (the parity rule — see `.claude/visions/retrieval/v1.md`). Do not add recency weighting beyond recaps, AND/OR tuning, scope hierarchies, or precedence rules speculatively; embeddings / semantic search are an open future direction in the vision, not v1.
