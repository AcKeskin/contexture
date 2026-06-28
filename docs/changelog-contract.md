# Changelog contract

The shared format for the canonical `CHANGELOG.md` ship-record and the rule-of-record for the [`update-changelog`](../skills/update-changelog/SKILL.md) skill and every caller that offers it ([`recap`](../skills/recap/SKILL.md), [`checkpoint`](../skills/checkpoint/SKILL.md), [`execute`](../skills/execute/SKILL.md), [`spec`](../skills/spec/SKILL.md), [`draft-plan`](../skills/draft-plan/SKILL.md)). This doc is the authority; the skill and callers cite it, they do not restate it.

## What the contract owns

The **shape of the ship-record**: file location, ordering, the unit of a line, the two line-types and when each applies, and the voice. It does **not** own *whether to write a line* (the `update-changelog` propose-confirm gate owns that), *what counts as a shippable unit* in any given session (the caller/user judges that against the rule below), or *the forward backlog* (`BACKLOG.md` owns the ranked queue — the changelog is the backward-looking record).

The changelog exists to be the **single "what actually happened, newest first" view** — the surface that cuts session re-alignment cost. It replaces `BACKLOG.md`'s "Recently shipped" prose section (which becomes a pointer). It does **not** replace the `build_progress` memory, which stays the *narrative-with-context* record (commit hashes, ship deviations, lessons) — the changelog is the index, build_progress is the story.

## 1. Location

- **Project with a deliberate root changelog**: `CHANGELOG.md` at the project root. Deliberately tracked — it is a real repo deliverable.
- **Any other project**: `.claude/CHANGELOG.md`. Gitignored-by-default like other `.claude/` artefacts.
- The skill resolves root-first, falls back to `.claude/`, and states which it wrote to.
- **Never edit `.gitignore` to force-track a changelog** (`sync_is_user_choice`). If a bare/global ignore rule would swallow the root `CHANGELOG.md` (the `global_claude_md_ignore_trap` shape), surface it to the user — do not silently work around it.

## 2. Ordering

**Reverse-chronological — newest first.** New lines prepend. The file reads top-down as "what happened most recently."

Entries are grouped under dated section headers:

```
## 2026-06-27

- <line>
- <line>

## 2026-06-24

- <line>
```

A new line on a date that already has a section prepends within that section. A new date opens a new section at the top.

## 3. The unit of a line

**One line per shipped unit of work — not per commit.** A unit is a proposal shipped, a multi-organ change landed, a feature delivered. Git owns the per-commit record; the changelog owns the per-*unit* record. A line that restates a single commit is wrong granularity — collapse the commits of one unit into one line.

A line is terse, dated-by-section, and in **repo-reader changelog voice**: what changed for someone reading the repo, not internal session vocabulary (`memory_compression_discipline` + the changelog-voice preference). Write "Added X" / "Shipped Y" / "Replaced Z", not "we then went and decided to…".

## 4. The two line-types

A changelog line is one of two types, visually marked so a reader can scan ships vs decisions:

- **Ship line** (default, marker `✓`) — a unit of work shipped. From the ship moments: a completed `/execute`, a post-build `/checkpoint`, a `/recap`'s completed items, the `092` archive terminus.

 ```
 - ✓ changelog-ledger — /update-changelog writer + CHANGELOG contract + a seed CHANGELOG; replaces the prose "Recently shipped" list
 ```

- **Decision line** (marker `◆`) — a *significant* planning-artifact change. From `/spec`, `/envision`, `/draft-plan` — but **only on a significant change**, never routine authoring churn (see §5).

 ```
 - ◆ Spec'd changelog-ledger — canonical CHANGELOG replacing BACKLOG "Recently shipped"; recap/checkpoint/execute callers
 ```

Both types are dated by section and follow the same voice. The marker is the only structural difference.

## 5. What does NOT belong (the significant-change rule)

The changelog is a timeline of **ships and significant decisions**, not an activity log. Excluded:

- **Per-commit noise.** Commits are git's job. One unit = one line regardless of commit count.
- **Routine planning churn.** A spec wording revision, a plan tweak, a vision re-phrasing — these are *authoring*, already tracked by versioned files + INDEX. They do **not** earn a decision line.
- **A decision line fires only on a *significant* planning-artifact change:** a **new** spec/vision/plan for a slug, or a **status transition** (a spec going `active`, a vision/spec being superseded, a plan completed). A v→v+1 wording revision is not significant.

The significant-change rule is a *soft* heuristic with a hard backstop: every changelog line goes through `update-changelog`'s propose-confirm gate. If an offered line isn't changelog-worthy, the user rejects it — nothing is written. So "significant" guides the offer; the human gate is the real filter. When in doubt, the caller may still offer; the gate prevents dilution.

## 6. Relationship to the other ship records

| Surface | Role | After 095 | | --- | --- | --- | | `CHANGELOG.md` | the canonical "what shipped, newest first" index | **new — the single chronological record** | | `BACKLOG.md` "Recently shipped" | was a prose ship-list | **replaced by a pointer to `CHANGELOG.md`** | | `BACKLOG.md` priority queue | the ranked *forward* queue | unchanged (the changelog is backward-looking) | | `build_progress` memory | narrative ship-record (hashes, deviations, lessons) | unchanged (the story; changelog is the index) | | `recap` files | per-session episodic record | unchanged (recap *offers* a changelog line on a shipped unit) | The net effect is **−1 surface**: the prose ship-list moves from BACKLOG into the canonical CHANGELOG, and nothing new is left scattered.
