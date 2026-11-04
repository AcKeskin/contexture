---
name: discover
description: Load relevant stored memories and codemap entries for the current task. Use when the user types /discover, asks to "load context," or a task is starting with stored context unsurfaced. Also callable by other skills (prep, review).
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

Retrieval is **MCP-primary**: memory + recap + codemap retrieval is owned by the **`project-memory` MCP engine**, out of context. This skill is a **thin client** over it, with a **static always-on floor** when the engine is unreachable.

Two responsibilities stay in this skill, NOT the MCP:
- **Rules-overlay resolution (§4a)** — the rules-overlay tier/patch/disable subsystem is a separate module; v1 keeps it skill-resident.
- **The fallback** — when the MCP is down, surface the static floor (§0b). The skill does **not** re-implement the full ranking as its primary path.

### 0. Primary path — query the MCP engine

Call `mcp__project-memory__discover` with the task-derived query:

```
mcp__project-memory__discover({
  cwd: <project root>,     // the engine resolves the layered tier
  include_codemap: true,
  ...                      // remaining params per "Query interface" below
})
```

The engine returns ranked memory fragments (with `📛` warning prefixes, `[related_to]` / `⚡ contradicts` flags, scope/relevance metadata), plus a `## Codemap` block, plus any `⚠️` shadowed-tier / case-split warnings. Surface that result directly (§9 shaping is mostly done by the engine). Then run §4a (rules-overlay) and merge: overlay-resolved rules are appended to the engine's result list and ranked by the same signals the engine reports (scope match, then kind priority, then description keyword overlap with the task); ties break toward the overlay rule, since a tier override outranks a shipped default. The merged list honours the caller's top_n as a single combined cap — overlay rules never bypass the cap. Deliver then renders the merged list's bodies exactly as in the degraded path (§9a applies to engine-returned bodies too).

**Open handoffs.** Also call `mcp__project-memory__list_handoffs`. If any are open (another agent or tool stopped mid-task here), list them and offer to claim one with `claim_handoff`. Claiming is the user's call; a claim can't be undone.

**Detecting MCP-unavailable:** the tool call errors, returns "No memory tree found" with no result, or the `project-memory` server is not connected. On any of these → fall through to §0b. Do not retry in a loop.

### 0b. Fallback — static always-on floor

When the engine is unreachable, do **not** silently re-run the full in-context scan as if nothing happened. Surface the **static floor** and say the engine is down:

1. Read `~/.claude/projects/<slug>/memory/MEMORY.md` (the fallback index).
2. Surface only the `relevance: always` entries (the load-bearing always-applicable set) plus any `kind: warning` entries whose scope plausibly matches the task.
3. Tell the user: *"project-memory MCP unavailable — showing the always-on floor only; ranked retrieval resumes when the MCP reconnects (restart the session or `/mcp reconnect`)."*

The richer in-context scan (§1–§9 below) remains documented as the **degraded deep-scan** the skill MAY run if the user explicitly asks for full retrieval while the MCP is down — but it is not the default fallback. Default fallback = the cheap static floor.

---

## Procedure (degraded deep-scan / reference contract)

*Contract-of-record for the engine; run in-context only on explicit request while the MCP is down (§0 supersedes for normal operation).*

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

When architectural rules are in the result, resolve the tier overlay per [overlay.md](overlay.md) before step 5.

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

For each candidate that survived §5 scoring, follow its `relations:` entries one hop:

| relation | action |
|---|---|
| `supersedes` | already filtered by §5 superseded suppression; do not re-pull the target. |
| `contradicts` | pull the target even if it didn't independently match; flag the pair `[contradicts]` in the report so the user can reconcile. |
| `supports` | if the target is already in the surfaced set, bump its score `+1`; if not, do *not* pull it in — a weight bonus, not a magnet. |
| `related_to` | soft pointer: pull the target with a `[related_to <source>]` flag. No transitive expansion — single-hop only. |

Cap relation-pulled additions at 3 per source candidate; beyond that keep the first 3 by `relations` order and note `[N more relations not expanded]` in the report.

After 5a, re-sort the surfaced set by score (relation-pulled entries take their source's score minus 1 unless they had their own §5 score, in which case the higher of the two).

### 6. Inferring task scopes

**Resolver-provided scopes are hard inputs.** When the caller (prep) ran the [scope-resolution resolver](../../docs/scope-resolution-resolver.md) for the task path, treat its resolved scopes as hard scope inputs (a task under a `go` submodule carries the `go`/region scopes, not the sibling region's) and pass its `corpus-source` to §4a. **Absent manifests → no resolver input → infer scopes exactly as below (no regression).**

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

Check `<project-root>/.claude/codemap.md`. If missing, skip §8 silently (the project may not have a codemap yet).

If present:
- Read and identify files/exports matching the inferred scopes and task keywords.
- Note the codemap's last-modified timestamp.

### 8a. Scan session recaps

Path: `<memory-root>/sessions/` (the project memory resolved in §1).

Skip silently if the folder does not exist — the project may have no recaps yet.

Scan filenames matching `YYYY-MM-DD-<slug>.md`. Parse the date.

Apply the **30-day auto-surface cutoff**: recaps with `date` within the last 30 days are auto-candidates; older recaps only if the task text explicitly names a matching project slug, branch, or date (e.g. "the auth branch from March", "last week's recap").

For each surviving recap, Read frontmatter. Score:

- `+2 × |task_scopes ∩ scope|` — scope overlap (same weight as other candidates).
- `+1 × keywords_hit` on `name` / `description`. Also scan the `Learned` section headings for bonus keyword hits.
- **Recency bonus:** `+2` if `date` is within 7 days; `+1` if 8–30 days.

Scored recaps join the §9 candidate set; when bodies are rendered (§9a) they deliver as tier `session-recap`. Recaps are opt-in: callers pass `include_recaps: true`; the default is false and §8a is skipped entirely.

### 9. Report

Report to the user in this shape:

```
Loaded N memories + R recaps + M codemap entries (codemap age: X days):
  Memories (high confidence):
    - 📛 [Warning Title] (scope: <tags>, relevance: <phase>)
    - [Title] (scope: <tags>, relevance: <phase>)
    - [Title] [related_to <source>] (scope: <tags>, relevance: <phase>)
    - [Title-A] ⚡ contradicts [Title-B] (both surfaced — needs reconciliation)
    - ...
  Memories (possibly relevant):
    - [Title] (scope: <tags>, relevance: <phase>)
    - ...
  Session recaps:
    - [Title] (date: <YYYY-MM-DD>, scope: <tags>)
    - ...
  Codemap:
    - path — summary
    - ...

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

When the caller asks for bodies, see [reference.md](reference.md), *render fragment bodies via deliver*.

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

The call shape other skills use: [reference.md](reference.md), *Query interface*.

