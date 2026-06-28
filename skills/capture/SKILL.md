---
name: capture
description: Capture a memory (lesson / decision / rule / preference / feedback / project fact / reference) via propose-confirm-commit. Use when the user types /capture, says "remember that" / "save this", or another skill invokes it. Also auto-*proposes* (never silent-writes — accept/edit/reject still gates) the moment a high-stakes item surfaces: a decision reversing a prior shipped decision, a correction phrased with finality, or a warning-shaped "X broke Z, hard to undo". Otherwise never auto-fires.
---

# capture

The capture organ. Writes stored memory for future discovery; inherits format and kind taxonomy.

## Prerequisite — load the format spec

Before classifying or writing anything, **Read `~/.claude/claude-md/memory-capture.md`** (the frontmatter template, kind table, folder layout, and capture rules). It is no longer always-on context — it loads here, on demand, only when capture actually runs. Every reference to `claude-md/memory-capture.md` below assumes you have read it this turn.

## When to run

- User types `/capture [content]` (explicit trigger).
- User says "remember that…", "save this as a memory," "capture this lesson."
- Another skill invokes capture programmatically (e.g. review's user-correction feedback loop when shipped).
- **High-stakes auto-propose.** Claude *proposes* a capture unprompted — **at the moment it happens, mid-session** — when a genuinely high-stakes item surfaces: (a) a decision that reverses or supersedes a prior shipped decision; (b) a correction the user phrases with finality ("never do X again", "this is the rule now"); (c) a `kind: warning`-shaped event ("I did X, it broke Z, hard to undo"). This is auto-***propose***, never auto-***write*** — the standard accept/edit/reject (§7) still gates every write, so the collaborator principle holds. Fire **on the event, not at session close** — deferring to `/recap` loses it when no recap runs (the [[incremental-capture-survives-missing-stop]] rule). Keep it **rare**: only the three shapes above; never auto-propose ordinary lessons.
- **Otherwise do not auto-fire.** No session-start or per-turn triggers. Mode B (silent episodic auto-*write*) stays parked — 061 widens auto-*propose* for high-stakes items only, never silent capture.

## Inputs

1. **Content source.**
 - Text passed after `/capture` → that text is the candidate rule / lesson / fact.
 - No arguments → infer content from the most recent user/assistant turns. If multiple recent turns could be the capture target, ask one clarifying question rather than guessing.
2. **Triggering context.** What in the session made this worth capturing — a correction, a decision, a surprise, a pattern. Use this to decide `kind` and to write the **Why:** line.
3. **Target project.** `$CLAUDE_PROJECT_DIR` if set, otherwise current working directory. Universal-applicable content may override to the global tree (see §"Universal vs project" below).

## Procedure

### 1. Classify `type`

From the content and how the user framed it:

| Trigger shape | `type` | | --- | --- | | User-given rule or directive ("always do X", "never do Y") | `feedback` | | Fact about the ongoing work (who / when / why) | `project` | | Pointer to an external system | `reference` | | User profile detail (role, preference, expertise) | `user` | `type` picks between flat top-level folders (`feedback/`, `project/`, `reference/`, `user/`) vs. the `kind`-keyed folders used for the others. See `claude-md/memory-capture.md` for the exact folder layout.

### 2. Classify `kind`

When `type` is not `feedback` / `project`, pick `kind`:

| `kind` | Use for | | --- | --- | | `lesson` (default) | Generalizable insight from experience — gotchas, non-obvious findings, principles | | `decision` | An explicit choice with stated reasoning | | `architectural-rule` | A discipline rule — SOLID-adjacent, language idiom, project invariant | | `canonical-command` | A verb→exact-command pin — the canonical way to run a tool the agent does often. A specialization of `architectural-rule`; routes to `canonical-commands.md` (see §5b). | | `preference` | User-style preference (verbosity, format, communication) | | `warning` | "This specific thing burned us; do not repeat." Sharp, narrow, references a real prior incident | The `lesson` vs `warning` distinction matters: a `lesson` is a generalizable insight (principle-shaped), a `warning` is a specific landmine that earned its place by citing what went wrong before. If the body has the shape "I did X on Y and it broke Z, can't easily undo," it's a warning, not a lesson. Discovery surfaces warnings first and visually highlights them.

Omit `kind` when default (`lesson`).

### 3. Classify `scope`

- Task-specific → match current working scope (language, module, domain).
- Universal → `[global]` or a named universal tag (e.g. `[universal, naming]`).
- Project-specific → include `[project-<slug>]` so discovery can filter.
- Multiple scopes allowed: `[auth, billing]` means relevant for either.

### 4. Classify `relevance`

- `always` — load-bearing rule that applies every session.
- `when-touching-<X>` — scoped to a domain / module / language.
- `when-language-<lang>` — language-gated (architectural-rule convention).
- `when-domain-<domain>` — domain-gated (architectural-rule convention).
- `during-planning` / `during-review` / `during-debug` — phase-specific.
- Multiple allowed, comma-separated.

### 5. Universal vs project

If the content is plainly universal (applies across every project, every language), prefer the global tree over per-project memory:

- `kind: architectural-rule` + universal/language/domain → the architectural-rules tree (but pick the **overlay tier** per step 5a — never write into the shipped tree directly).
- Everything else universal → `~/.claude/memory/<folder>/<topic>.md` if the user has a global memory tree; otherwise project memory with `scope: [global]` and a note that this may want promoting later.

If ambiguous (feels universal but might be project-specific), ask the user before writing.

### 5a. Overlay tier (architectural-rule only —)

When `kind: architectural-rule`, the rule must land in an **overlay tier**, not the shipped tree (the shipped tree is synced + symlinked; hand-writing into it is the [[plugin-cache-edits-revert-on-update]] landmine). Ask the target tier:

| Tier | Path | When | | --- | --- | --- | | **user** (default) | `~/.claude/architectural-rules-local/<scope>/<name>.md` | personal rule, this machine / the user's own sync | | **company** | `~/.claude/architectural-rules-company/<scope>/<name>.md` | a team rule — only when the user maintains the company repo locally; remind them to commit + push it | | **project** | `<project-root>/.claude/rules/<scope>/<name>.md` | rule specific to this codebase, committed with it | Write `origin: <tier>` into the frontmatter (`origin: user | company | project`). Default to **user** unless the user says otherwise.

**Override vs new rule.** If a file with the same `<scope>/<name>` key already exists in a lower tier (shipped or company), the user is *overriding* it. Offer the choice:
- **whole-file** — the new file replaces the lower one entirely (seed the draft from the lower-tier body so they start from the real baseline).
- **field patch** — set `override: <scope>/<name>` + `mode: patch` and capture only the deltas (`## remove` / `## replace` / `## add`), anchored on the lower file's bullet ids. Lighter; survives upstream evolution.

Surface which lower-tier file is being shadowed/patched so the user confirms intent. For a genuinely new key (no lower-tier file), it's a plain add — no override frontmatter.

This step routes only `kind: architectural-rule`. All other kinds follow steps 5 / 8 unchanged. The `rules` skill is the richer front door for managing existing overlay rules; capture is where a *new* rule is born mid-conversation.

### 5b. Canonical-command route

`kind: canonical-command` is a specialization of `architectural-rule`: it's a verb→exact-command pin that lives in **`canonical-commands.md`**, not its own file. Fires most often when the user *corrects an improvised command* ("no — use `gh api …/comments --paginate`, you missed comments again"): that correction is a candidate pin.

Route it through §5a's overlay-tier choice (user / company / project), but the destination is a **section appended to the tier's `canonical-commands.md`**, not a new per-rule file:
- **user / company** → `…/architectural-rules-{local,company}/universal/canonical-commands.md`
- **project** → `<repo>/CLAUDE.md`'s `## Canonical commands` section, or `<repo>/.claude/canonical-commands.md` — project pins override universal ones (the resolution order the shipped `universal/canonical-commands.md` documents).

Draft the entry in that file's strict shape — `### <verb>`, a fenced command block, then a **mandatory** `**Why:**` line (the rationale is what lets the agent adapt; a pin without it is the slop case). Before writing, **redact** per §-redaction: a pinned command must be safe to commit, so a token / API key / internal URL in the command is rejected — force an env var or placeholder. If the verb already has a pin, this is an *override*: surface the existing entry and confirm intent (same as §5a's override flow).

### 6. Draft

Build the frontmatter per `claude-md/memory-capture.md`:

```yaml
---
name: <short title>
description: <one-line, specific enough for discovery to judge relevance>
type: <type>
kind: <kind — omit if default lesson>
scope: [<tags>]
relevance: <relevance clauses>
relations: # optional — populated by step 6a if there are cross-memory links
 - type: <supersedes | contradicts | supports | related_to>
 target: <relative path>
 note: <optional context>
---
```

**Always quote the `description` value** (and any frontmatter scalar that may contain `:` `#` `[` `]` `{` `}` `&` `*`). An unquoted `description:` with a `: ` inside parses as a nested YAML map, fails, and the loader **silently drops the whole memory** from the corpus — see [[unquoted-yaml-description-with-colon-silently-drops-the-memory]]. Default to double-quoting descriptions; it is never wrong to quote.

Body: **rule + why + scope**, in the **model-optimized compressed form** — memory bodies are read by models, not humans. Follow [`docs/memory-compression-spec.md`](../../docs/memory-compression-spec.md): hybrid by field (`description` + MEMORY.md hook stay human-legible — they are the discovery signal; the body goes terse shorthand), and the **misapplication test** for the why-line:

> Keep the why iff removing it would let a future model misapply the rule. Drop it when the rule self-enforces.

For `type: feedback` and `type: project` bodies,'s `**Why:**` / `**How to apply:**` lines apply *through that test* — keep the why compressed (`why: <terse cause>`) when load-bearing, fold/drop `how-to-apply` unless it adds a firing condition the rule doesn't already imply. `kind: warning` bodies always keep their (compressed) incident anchor — it is what makes a warning a warning.

### 6a. Cross-memory relations

Before writing, find existing memories whose territory overlaps the new one. **Primary path:** query the engine — `mcp__project-memory__discover({ cwd, task_keywords: [<new memory's key terms>], scopes: [<new memory's scopes>], top_n: 8 })` — and treat its ranked hits as the relation candidates (out of context, and it already surfaces `⚡ contradicts` / `[related_to]` flags on neighbours). **Fallback** (MCP down): scan MEMORY.md in-context for entries whose title or hook overlaps the new memory's title / description / scope. For each plausible match:

- **Read the candidate's body.** Decide whether the new memory replaces it (`supersedes`), disagrees with it (`contradicts`), reinforces it (`supports`), or is a sibling in territory (`related_to`). Often the answer is "none — they're independent." Don't force a relation.
- **For `supersedes`:** confirm with the user before writing. Supersedes is the load-bearing relation — it hides the target from normal discovery. The prompt:

 > Capturing this memory looks like it would supersede `<target-path>`. Confirm? (y / n / show target)
 >
 > - y → write `supersedes: <target>` on new memory; write `superseded_by: <new-path>` on target in the same step.
 > - n → no relation written; new memory and target both stay active.
 > - show target → display the target's body for the user to compare, then re-ask.

- **For `contradicts`:** propose the link and the `note:` text capturing *why* they disagree. The user accepts/edits.
- **For `supports` / `related_to`:** propose, accept-with-no-friction. These don't change retrieval behavior dramatically; over-linking is cheap to roll back.

Bidirectional integrity (mandatory for `supersedes`):
- Writing `supersedes: target.md` on the new memory **always** also writes `superseded_by: <new-path>` on the target. Two file writes in one step. If the target write fails for any reason, abort the whole capture — don't leave a one-way relation in place.

`related_to` and `supports` are bidirectional in spirit but not enforced — discovery treats them as soft hints either way.

Skip 6a entirely when MEMORY.md scan returns no plausible candidates. Most captures have no cross-memory link to record.

### 6b. Bloat budget guard (write-time)

Before proposing, run two cheap checks so bloat cannot enter the corpus at the source (the permanent counter-force to corpus growth — see `docs/memory-compression-spec.md` and `/memory-audit` dim 10):

**Body-size budget.** Measure the drafted body (bytes, excluding frontmatter):
- **≤ ~600 B** → fine, proceed.
- **600–1000 B** → acceptable only if the content genuinely needs it (a table, a multi-case rule, an incident anchor). If it's prose that could compress, compress it first.
- **> ~1000 B** → over budget. Re-compress per the spec before proposing. If it still exceeds after honest compression, the memory is probably **two memories** — split it. Never propose an >1000 B body without either compressing or flagging *why* it must be large in the proposal.

**`relevance: always` challenge.** If the draft sets `relevance: always`, justify it explicitly: *"does this genuinely apply every single session, or only when touching a domain/phase?"* `always` is the always-on floor — every entry there is paid every session. Default to a scoped/phase relevance (`when-touching-X`, `during-review`) unless the rule is a load-bearing discipline that fires regardless of task. Finished-work facts, tool-specific gotchas, and domain rules are **never** `always`. State the justification in the proposal so the user can veto.

These are guards, not gates — the user can override in §7. But the check must *run* and its result must appear in the proposal, so an over-budget body or a new `always` is a conscious choice, never an accident.

### 7. Propose

Show the user:
- **Target path** — where the file will land (absolute or `~/`-relative).
- **Full frontmatter and body** — no placeholders.
- **MEMORY.md index line** that will be appended (if applicable — see §8).
- **Budget line** (§6b) — body size vs budget, and the `relevance: always` justification if applicable.

Ask: *accept / edit / reject*.

### 7a. Pre-write secret scan

After the user accepts in step 7 but **before** the disk write in step 8, run the secret-pattern set from [`secret-patterns.md`](secret-patterns.md) over the proposed body and over every frontmatter value (description, name, scope tags, relations notes, etc.). Frontmatter keys themselves are not scanned — they're a fixed schema.

For each pattern in the set, walk the text and collect matches as `(pattern_name, type_label, matched_text, line_offset)`.

**Zero matches** → continue to step 8. The redaction pass is invisible when nothing fires.

**Matches found** → halt the write. For each match, surface to the user:

```
Capture paused — possible secret detected.

Pattern: <type_label> (matches /<regex>/)
Line <N>: "<matched_text>"

(r)edact and continue — replace with <REDACTED:<pattern_name>>
(e)dit body manually before retrying
(a)bort — don't write this memory
(i)gnore — pattern misfire, write this match as-is (logs to false-positive table)
```

Process matches one at a time (not all at once). The user picks per match:

- **r → redact and continue.** Substitute the matched text with `<REDACTED:<pattern_name>>` in the body / frontmatter value. Re-run the entire pattern set against the (now-modified) text — there may be more matches the first didn't expose, or new ones overlapping. Keep redacting until zero matches remain, then continue to step 8.
- **e → edit body.** Drop back into step 7 with the current draft for the user to edit. Loop. (The user's edit may resolve all matches manually, in which case the next pass through 7a finds zero.)
- **a → abort.** Discard the capture cleanly. No file, no MEMORY.md change, no residue. Same as step 8 reject.
- **i → ignore (false positive).** Write the match as-is. Append a row to the false-positive table in `secret-patterns.md` capturing the pattern name, a *sanitized* version of the match (replace the secret-like token with `<example>`), and the user's one-line reason. Re-run the rest of the pattern set on the body to catch any unrelated matches; ignore is per-match, not per-capture.

The `i` path matters: regex sweeps will misfire on documentation, tutorial snippets, or example identifiers. Forcing the user to edit-around or abort would degrade the capture experience. Per-match ignore preserves user agency; the false-positive log feeds future pattern refinement.

When `r` fully resolves all matches (text no longer triggers any pattern), continue to step 8 with the redacted text. The body that lands on disk is the post-redaction version; the original (with secrets) is never written anywhere — not to disk, not to the false-positive log, not to anywhere.

### 8. Commit

**On accept:**
1. Create the target folder lazily if absent.
2. Write the file.
3. If the file is under a `MEMORY.md`-indexed tree (per-project memory root, not any architectural-rules tier — overlay rule files are discovered by folder scan, not MEMORY.md), append one line to `MEMORY.md`:
 ```
 - [Short title](path/including/subfolder.md) — terse one-line hook
 ```
 Path includes the subfolder. Hook ≤ ~150 chars.
4. Report the written path and index line.

**On edit:**
1. Take the user's edit as the new draft.
2. Loop back to step 7.

**On reject:**
1. Discard. No file, no index change, no residue.
2. Acknowledge and move on.

## Failure modes

- **Cannot classify `kind` confidently** — propose best guess, flag the uncertainty in the proposal message, let the user override. Do not silently commit a fuzzy classification.
- **Ambiguous target folder** (e.g. "is this a universal rule or a C++-specific rule?") — ask one clarifying question. Do not write to both locations.
- **Project memory root missing** — create `~/.claude/projects/<slug>/memory/` and seed `MEMORY.md` with a header line before writing the first file.
- **`MEMORY.md` write race** (rare, but possible if user has another session open) — if the file has changed since read, re-read, reconcile, re-append. Never blind-overwrite.
- **Content plainly duplicates an existing memory** — surface the duplicate in the proposal, ask whether to replace / merge / reject. Never silently overwrite.

## What capture does NOT do

- **Does not auto-fire.** Mode B parked.
- **Does not decide when to capture.** Triggers live in calling context (user says "remember", review surfaces a correction). This skill owns the *how*, not the *when*.
- **Does not modify existing memories for reasons beyond the specific capture.** Lazy migration of old files happens only when the user edits them for another reason (per `memory-capture.md`).
- **Does not read stored memory.** That's discovery's job ( / `skills/discover`).
- **Does not silent-redact.** The pre-write secret scan (step 7a) always halts and surfaces matches; never substitutes without user confirmation. The threat model is "I forgot the stack trace contained a key," not "an attacker is trying to slip a key past redaction" — the user is in the loop on every match.
- **Does not retroactively scan existing memories.** Step 7a runs at capture time only. Retrospective scanning of already-written memories lives in `/memory-audit` dimension 9 (+025 interaction).

See [`docs/capture-organ.md`](../../docs/capture-organ.md) for the organ's scope map and relationship to the rest of the context family.
