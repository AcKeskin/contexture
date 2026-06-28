---
name: update-changelog
description: Append a dated line to the project's canonical CHANGELOG.md — the "what shipped, newest first" ship-record — via propose-confirm. Use when the user types /update-changelog, says "log this ship" / "record what shipped" / "add to the changelog", or when a caller skill (recap, checkpoint, execute, spec, draft-plan) offers it on a shipped unit of work or a significant planning-artifact change. One line per shipped unit, not per commit. Mode A — never auto-fires, never auto-writes; every line goes through accept/edit/reject. Zero always-on cost (loaded only when invoked).
---

# update-changelog

The changelog writer. Maintains the canonical `CHANGELOG.md` — the single reverse-chronological "what actually happened" ship-record that cuts session re-alignment cost. It is the **one writer**; several caller skills *offer* it but never write the changelog themselves.

## Prerequisite — load the format contract

Before composing or writing anything, **Read [`docs/changelog-contract.md`](../../docs/changelog-contract.md)** (location resolution, ordering, the unit of a line, the two line-types, the significant-change rule, voice). It is the authority; this skill applies it. Every reference below assumes you have read it this turn.

## When to run

- User types `/update-changelog [unit description]` (explicit trigger).
- User says "log this ship", "record what shipped", "add this to the changelog".
- **Another skill offers it** (the caller path): `recap`, `checkpoint`, `execute`, `spec`, `draft-plan` invite `/update-changelog` at a ship moment or a significant planning-artifact change. The caller surfaces the offer; the user accepts; this skill does the write. The skill is the writer, the callers are the doorways.
- **Otherwise never auto-fires.** No session-start, no per-turn, no hook trigger. And it **never auto-writes** — the propose-confirm gate (§3) gates every line, even on the caller path.

## Inputs

1. **The unit.** Text after `/update-changelog` describes the shipped unit / significant change. No argument → infer from the recent turns (what was just shipped or decided); ask one clarifying question if multiple candidates.
2. **Line-type signal.** From the trigger: a ship moment (execute-done / checkpoint / recap / 092) → **ship line** (`✓`); a significant planning-artifact change (spec / envision / draft-plan) → **decision line** (`◆`). When invoked directly, infer from the unit; when ambiguous, ask.
3. **Target project.** `$CLAUDE_PROJECT_DIR` if set, else cwd.

## Procedure

### 1. Resolve the target CHANGELOG

Per the contract §1:
- Project root `CHANGELOG.md` if it exists, or the project plainly declares one → use it.
- Else `.claude/CHANGELOG.md` (create lazily on first accepted write).
- **State which file** you will write to before proposing.
- If the root `CHANGELOG.md` would be swallowed by a bare/global `.gitignore` rule (`git check-ignore` it), **surface that to the user** — do not edit `.gitignore` to force-track (`sync_is_user_choice`).

### 2. Classify the line-type and compose

- Pick **ship line** (`✓`) or **decision line** (`◆`) per the input signal + contract §4.
- **Significant-change gate (decision lines only).** Per contract §5: a decision line is warranted only for a *significant* planning-artifact change — a new spec/vision/plan for a slug, or a status transition — not a routine wording revision. If the change is routine churn, say so and do not propose a line (the user can override).
- Compose **one line** in repo-reader changelog voice (contract §3): terse, what-changed-for-a-reader, per shipped *unit* not per commit. Resolve today's date for the section header.

### 3. Propose — confirm before writing

Show the user, exactly:
- the **composed line** (with its `✓`/`◆` marker),
- the **target file** and **where it lands** (which dated section — new or existing),
- then ask: **accept / edit / reject**.

**Nothing is written until accept.** This is the same propose-confirm-commit gate `capture` / `recap` / `rules` use. On the caller path the gate still fires — a caller's offer is not a write.

- **accept** → §4.
- **edit** → user revises the line in prose; re-propose; loop until accept or reject.
- **reject** → write nothing. Acknowledge (*"Nothing logged."*) and stop. (Rejecting is the real filter behind the significant-change heuristic — a non-changelog-worthy offer dies here.)

### 4. Prepend

**First, dedup against the existing log.** Before prepending, scan the recent sections for an existing line covering the *same unit* (same proposal number / slug / feature). If one exists:
- If it already says the same thing → **no new line**; tell the user it's already logged. (A unit logged at seed-time or by an earlier caller should not be duplicated — a stale duplicate is worse than no line.)
- If the existing line is now *stale* (e.g. it was written mid-build and the unit has since changed scope) → offer to **edit the existing line in place** rather than add a second one.
- Only prepend a fresh line when the unit is genuinely unlogged.

Then write:
- If today's dated section (`## YYYY-MM-DD`) exists, prepend the line within it (newest first).
- Else open a new dated section at the **top** of the file, above the previous newest section.
- Preserve everything else verbatim. The changelog is an **append-only log** (`version-evolving-artefacts-not-refuse` — append-only logs are explicitly *not* versioned folders; a flat file is correct). Append-only governs *storage shape* (flat file, prepend), not *blind duplication* — the dedup check above still applies.

### 5. Offer the BACKLOG-row sync (optional)

If the shipped unit has a row in this project's `BACKLOG.md` priority queue (proposal/feature queue), **offer** to remove that row — closing the documented-but-manual "delete row + note ship" loop BACKLOG itself describes. Propose-confirm; **never auto-removes**. Skip silently if there is no BACKLOG or no matching row.

### 6. Close

> Logged to `<CHANGELOG path>` under `## <date>`. <ship/decision> line added.

Do not commit (the user's call). Do not touch build_progress or the CLAUDE.md coverage map — those stay their own records (contract §6).

## What update-changelog does NOT do

- **Does not auto-write.** Every line passes the §3 accept/edit/reject gate, including on the caller path.
- **Does not auto-fire.** No session-start / per-turn / hook trigger. Callers *offer*; the user *invokes*.
- **Does not log per-commit.** One line per shipped unit (contract §3). Git owns the commit log.
- **Does not log routine planning churn.** Decision lines fire only on significant changes (contract §5); the gate filters the rest.
- **Does not replace build_progress, recap, or the BACKLOG forward queue** — only BACKLOG's "Recently shipped" prose section (contract §6).
- **Does not edit `.gitignore`** to force-track a changelog (`sync_is_user_choice`).
- **Does not commit** the changelog change.

## Relationship to other organs

- **[changelog-contract](../../docs/changelog-contract.md)** — the format authority this skill applies (location / ordering / line-types / significant-change rule / voice).
- **recap (013/062)** — offers a ship line on a session's completed units; this skill writes it.
- **checkpoint** — offers a ship line at a post-build module checkpoint.
- **execute** — offers a ship line when a plan completes with done-criteria met.
- **spec / draft-plan / envision** — offer a *decision* line on a significant planning-artifact change (significant-change-gated).
- **[close-out](../close-out/SKILL.md)** — the scope chain's terminus; its *record* step calls this writer as the chain's single ledger write (the named 092→095 seam). close-out is a doorway, update-changelog is the writer.
- **BACKLOG.md** — the forward queue (unchanged); its "Recently shipped" section is replaced by a pointer to the changelog, and §5 offers to retire a shipped row.
- **build_progress memory** — the narrative ship-record (hashes/deviations/lessons), untouched; the changelog is the index, build_progress is the story.
