---
name: recap
description: "Write a session recap: an episodic record of what the session was about, what was investigated, learned and completed, and what's next; Learned items can be promoted to memories via /capture. Use on /recap, \"recap this session\", \"write session notes\", or session-closure signals (done for today, PR merged, deliberate pause). Mode A — never auto-fires."
---

# recap

Session recaps are the second memory tier — episodic, per-session, structured. Rules (existing tier) answer *how should I work*; recaps answer *what happened and where did I leave off*. Format follows [`claude-md/memory-capture.md`](../../claude-md/memory-capture.md) §"Folder layout" — `type: session-recap`, lands under `memory/sessions/`.

## When to run

- User types `/recap [title]` (explicit trigger; title is optional).
- User says "wrap up", "write session notes", "recap this session", "document what we did".
- Claude proposes a recap when the user signals session closure — e.g. "done for today", "that's it for now", a PR merge, a deliberate pause after a non-trivial chunk of work. **Propose, don't write.** User confirms before anything lands.
- **Never** fires automatically on time, event, or tool-use boundary. Mode B stays parked.
- The `clear-context-decision-guard` hook may surface a recovery nudge at the *start of a new session* if the previous one was cleared/compacted while decisions sat unrecapped. That nudge routes here — propose a recap reconstructing the prior session's decisions from its on-disk transcript. A recap that writes a `sessions/*.md` file is the guard's "persisted" watermark; once it runs, the guard goes quiet.

## Inputs

1. **Session context.** The current in-conversation transcript — what the user asked for, what Claude investigated / touched / shipped, what was learned that's worth future recall.
2. **Arguments after `/recap`** — optional short title for the recap. When omitted, Claude infers from the session's primary goal.
3. **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Determines which project's memory tree receives the recap.
4. **The `--under-wrap` signal** (set only when [`wrap`](../wrap/SKILL.md) invokes recap as part of the session-terminus ceremony). When present, recap **suppresses its own §7.4 close/changelog doorways** — `/wrap` owns those offers (its steps 4–5), so recap offering them too would double-offer. Everything else (gather, draft, write, §8 promotion, §9 bloat check) runs unchanged. Absent the signal (a standalone `/recap`), §7.4 fires as normal.

## Procedure

### 1. Resolve project memory directory

Same as discover §1: Glob for `~/.claude/projects/*/memory/MEMORY.md`, pick the match whose path contains the project root directory name. If no match, the tree does not exist yet — creation (including slug derivation) is defined once, in [capture](../capture/SKILL.md) § Failure modes, the organ that owns memory writes. Follow it there rather than restating it.

The recaps folder is `<memory-root>/sessions/`. Create if absent.

### 2. Gather session content

Inventory what happened in the session:

- **Primary request.** Top of session, or the last major pivot. Quote in user's words where possible.
- **Files touched.** Walk the tool-use history — Edit / Write / Read targets on files (not ephemeral reads). List unique paths.
- **Commits produced.** If the project is a git repo, run `git log --oneline <base>..HEAD` (base = `main` or the branch's merge-base) to enumerate commits made during the session. If not on a feature branch, `git log --oneline -N` for the N most recent commits that match the session window.
- **Findings / corrections / decisions.** Scan for user corrections, design decisions made, surprises, non-obvious behaviours that were resolved. These are Learned candidates.
- **Pending work.** If the session ended mid-task (explicit user pause, unresolved blocker, unfinished todo list), note what resumes next.

### 3. Classify recap metadata

- `date` — today (ISO `YYYY-MM-DD`).
- `branch` — current git branch if in a repo, else omit.
- `scope` — `[<project-slug>]` plus up to two keyword tags from the session's primary theme (e.g. `[<project-slug>, feature-x, module-y]`).
- `name` — short title, kebab-case or plain prose. Matches the user's argument if given; else inferred from primary goal.
- `description` — one line, specific enough for future discovery to rank relevance.
- **Target path** — `<memory-root>/sessions/<YYYY-MM-DD>-<slug>.md`. Slug is a short kebab-case rendering of `name`.

### 4. Check for existing same-day recap

Scan `sessions/` for files matching today's date. If one exists with an overlapping primary goal:

- Ask the user: *"There's a recap at `<path>` from earlier today covering `<its-goal>`. Append a new section to that file, or create a new recap?"*
- Default on silence: **new file** with a disambiguating suffix (e.g. `2026-04-21-context-build-2.md`).

### 5. Draft the recap

Frontmatter per `memory-capture.md`:

```yaml
---
name: <title>
description: <one-line>
type: session-recap
scope: [<project-slug>, <theme-tags>]
date: <YYYY-MM-DD>
branch: <git branch or omit>
---
```

Body sections, all optional (omit when empty — no ceremony):

- **Request** — user's words where possible. One paragraph max.
- **Investigated** — terse list: files read, questions explored, dead ends. Bullets, not narrative.
- **Reality check** — the honest counterweight to the progress sections: what was *tried and abandoned*, what is *unverified / still shaky*, where the work *assumed or guessed*. Symmetric to `/review`'s "things that look bad but are actually fine" — its job is to stop the recap reading as a success-narrative. Prefer one honest line to omitting it; an empty reality-check is itself a signal worth seeing.
- **Learned** — non-obvious findings worth future recall. Each item one line. **Promotion candidates.** If empty, omit the section entirely.
- **Completed** — commits (with short SHAs if available), files modified, PRs opened/merged. Bullets.
- **Next steps** — only if session ended mid-task. Each item carries its real status so the list doesn't manufacture false momentum: **`[ready]`** (teed up, pick up as-is), **`[blocked: <on what>]`** (needs a decision/dependency first), **`[maybe]`** (aspirational — explicitly *not* a committed next action). A bare wishlist with everything looking equally ready is the anti-pattern.
- **References** — external links, commit SHAs, PR/issue numbers. Only when non-trivially useful.

Compression discipline applies: rule + why + scope style extends to recap bodies — terse, factual, no summarising prose.

### 6. Propose

Show the user:
- **Target path** — absolute or `~/`-relative.
- **Full frontmatter + body** — no placeholders.
- **Promotion preview** — if `Learned` section has items, list them separately with a note: *"After commit, offer to promote these as rule-tier memories."*

Ask: *accept / edit / reject*.

### 7. Commit

**On accept:**
1. Create `sessions/` folder if absent.
2. Write the file (new) or append a dated section (if the user chose "append" in step 4).
3. Report the written path.
4. **Offer the close for any shipped unit.** **Skipped entirely when invoked with `--under-wrap`** (Inputs §4) — `/wrap` owns the close/changelog offers, so recap stays a silent doorway in that path to avoid a double-offer. Absent the signal (standalone `/recap`), offer as normal: if this session's `Completed` section records a *shipped unit of work* (a proposal landed, a feature/organ shipped — not mere in-progress edits), offer the close at the depth that fits the unit:
   - **A shipped feature that has a spec/plan under `.claude/` (a closeable slug)** → offer the **full close**: *"This session shipped &lt;slug&gt; — run `/close-out &lt;slug&gt;` to reconcile its spec, file the plan, and log the ship line in one pass? (y/N)"*. On `y`, invoke [`skills/close-out/SKILL.md`](../close-out/SKILL.md) — it *contains* the changelog write, so it is the superset, not a second offer.
   - **A shipped unit with no spec/plan to reconcile** (a doc change, a one-off) → offer just the **changelog line**: *"This session shipped &lt;unit&gt; — log it to CHANGELOG? (y/N)"*. On `y`, invoke [`skills/update-changelog/SKILL.md`](../update-changelog/SKILL.md).

   recap is a *doorway*, not the writer — it never writes the changelog or reconciles a spec itself; both `/close-out` and `/update-changelog` run behind their own accept/edit/reject gates. Skip silently when nothing shipped (sessions that only investigated/planned produce no offer).
5. **Offer a handoff for unfinished work.** If the recap's next steps are open and the work may continue in another session or tool (Codex, Copilot, ...), offer: *"Leave a handoff for the next agent? (y/N)"*. On `y`, call `mcp__project-memory__write_handoff` with the summary, next steps, what failed, open questions, and key files from the recap. Skip when the MCP is not connected.
6. Proceed to step 8 (promotion pass).

**On edit:** take the user's edit as the new draft; loop to step 6.

**On reject:** discard silently. Acknowledge and move on.

### 8. Promotion pass

If the committed recap has a non-empty `Learned` section:

- For each `Learned` item, ask whether to promote it to a rule-tier memory.
- Present the three options per item: *promote (invoke capture with this item as candidate content)*, *skip*, *skip all remaining*.
- On *promote*, invoke [`skills/capture/SKILL.md`](../capture/SKILL.md) programmatically with the item text. Capture classifies kind / scope / relevance, drafts the memory, and user confirms per capture's own flow.
- Track accepted / skipped counts; report after the pass.

Promotion is opt-in per item. Do not batch without asking — the collaborator principle extends here.

### 9. Bloat check (session-close forcing function)

Recap is the one organ that runs at *every* deliberate session close, so it is the natural recurring guard against corpus bloat (no separate scheduler needed). After the promotion pass, do a cheap read of MEMORY.md's budget scoreboard (the `<!-- BUDGET: ... -->` header — see `claude-md/memory-capture.md`):

- **If this session added memories**, recompute and update the scoreboard counts (`memories`, and `always-on` / `always-bytes` if any new entry is `relevance: always`) in the same recap commit. Keeping the scoreboard live is recap's job because recap is the reliable session-close hook — capture does not update it per-write, so recap is the only organ that reconciles it.
- **If a soft ceiling is crossed** — `always-on > ~20 files` or `always-bytes > ~60 KB` or `memories` grew a lot since `last-audit` — surface a one-line nudge: *"Memory floor is at <A> always-on files / <B> KB (ceiling ~20/~60). Want to run `/memory-audit --check 10` to prune?"* Do not run it unprompted — just surface the signal at the moment the user is already wrapping up.
- **If nothing crossed**, say nothing. The check is invisible when the corpus is healthy.

This closes the loop: capture guards entry (§6b), the scoreboard makes growth visible every session, and recap turns "wrapping up anyway" into the recurring moment the floor gets checked.

More in [reference.md](reference.md): failure modes, What recap does NOT do, relationship to other organs.
