---
name: capture
description: "Save a memory (lesson, decision, rule, preference or project fact) via propose-confirm-commit. Use whenever the user asks to remember or save something, or on /capture, instead of writing a memory file directly. Auto-proposes (never silent-writes) only when high-stakes: a reversal of a shipped decision, a correction phrased with finality, or a warning that something broke and is hard to undo."
---

# capture

The capture organ. Writes stored memory for future discovery; the memory format and kind taxonomy live in the format spec below.

## Prerequisite — load the format spec

Before classifying or writing anything, **Read `../../claude-md/memory-capture.md`, relative to this SKILL.md's real location** (`~/.claude/claude-md/memory-capture.md` on a bootstrap install) (the frontmatter template, kind table, folder layout, and capture rules). It is not always-on context — it loads here, on demand, only when capture actually runs. Every reference to `claude-md/memory-capture.md` below assumes you have read it this turn.

## When to run

- User types `/capture [content]` (explicit trigger).
- User says "remember that…", "save this as a memory," "capture this lesson."
- Another skill invokes capture programmatically (e.g. review's user-correction feedback loop).
- **High-stakes auto-propose.** Claude *proposes* a capture unprompted — **at the moment it happens, mid-session** — when a genuinely high-stakes item surfaces: (a) a decision that reverses or supersedes a prior shipped decision; (b) a correction the user phrases with finality ("never do X again", "this is the rule now"); (c) a `kind: warning`-shaped event ("I did X, it broke Z, hard to undo"). This is auto-***propose***, never auto-***write*** — the standard accept/edit/reject (§7) still gates every write, so the collaborator principle holds. Fire **on the event, not at session close** — deferring to `/recap` loses it when no recap runs. Keep it **rare**: only the three shapes above; never auto-propose ordinary lessons.
- **Command facts.** The `command-facts` hook may ask at session start to offer a command spelling confirmed in 3+ sessions (`pytest` not found, `python -m pytest` works). Offer it once; on yes, run this procedure with `type: project`.
- **Otherwise do not auto-fire.** No other session-start or per-turn triggers. Mode B (silent episodic auto-*write*) stays parked — see the auto-propose bullet above.

## Inputs

1. **Content source.**
   - Text passed after `/capture` → that text is the candidate rule / lesson / fact.
   - No arguments → infer content from the most recent user/assistant turns. If multiple recent turns could be the capture target, ask one clarifying question rather than guessing.
2. **Triggering context.** What in the session made this worth capturing — a correction, a decision, a surprise, a pattern. Use this to decide `kind` and to write the **Why:** line.
3. **Target project.** `$CLAUDE_PROJECT_DIR` if set, otherwise current working directory. Universal-applicable content may override to the global tree (see §"Universal vs project" below).

## Procedure

### 1. Classify `type`

From the content and how the user framed it:

| Trigger shape | `type` |
| --- | --- |
| User-given rule or directive ("always do X", "never do Y") | `feedback` |
| Fact about the ongoing work (who / when / why) | `project` |
| Pointer to an external system | `reference` |
| User profile detail (role, preference, expertise) | `user` |

`type` picks between flat top-level folders (`feedback/`, `project/`, `reference/`, `user/`) vs. the `kind`-keyed folders used for the others. See `claude-md/memory-capture.md` for the exact folder layout.

### 2. Classify `kind`

When `type` is not `feedback` / `project`, pick `kind` per `memory-capture.md`'s kind table. Additional kind owned here: `canonical-command` — a verb→exact-command pin, a specialization of `architectural-rule`, routes per §5b. `canonical-command` never lands as file frontmatter — §5b writes sections into the canonical-commands rule file, so the kind enums of memory-audit and the engine are unaffected. If the body has the shape "I did X on Y and it broke Z, hard to undo," it's a `warning`, not a `lesson`. Omit `kind` when default (`lesson`).

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

### 5a. Overlay tier (architectural-rule only)

When `kind: architectural-rule`, the rule must land in an **overlay tier**, not the shipped tree (the shipped tree is synced + symlinked; hand-edits there are overwritten on the next sync). Ask the target tier:

| Tier | Path | When |
| --- | --- | --- |
| **user** (default) | `~/.claude/architectural-rules-local/<scope>/<name>.md` | personal rule, this machine / the user's own sync |
| **company** | `~/.claude/architectural-rules-company/<scope>/<name>.md` | a team rule — only when the user maintains the company repo locally; remind them to commit + push it |
| **project** | `<project-root>/.claude/rules/<scope>/<name>.md` | rule specific to this codebase, committed with it |

Write `origin: <tier>` into the frontmatter (`origin: user | company | project`). Default to **user** unless the user says otherwise.

**Override vs new rule.** If a file with the same `<scope>/<name>` key already exists in a lower tier (shipped or company), the user is *overriding* it. Offer the choice:
- **whole-file** — the new file replaces the lower one entirely (seed the draft from the lower-tier body so they start from the real baseline).
- **field patch** — set `override: <scope>/<name>` + `mode: patch` and capture only the deltas (`## remove` / `## replace` / `## add`), anchored on the lower file's bullet ids. Lighter; survives upstream evolution.

Surface which lower-tier file is being shadowed/patched so the user confirms intent. For a genuinely new key (no lower-tier file), it's a plain add — no override frontmatter.

This step routes only `kind: architectural-rule`. All other kinds follow steps 5 / 8 unchanged. The `rules` skill is the richer front door for managing existing overlay rules; capture is where a *new* rule is born mid-conversation.

### 5b. Canonical-command route

A `canonical-command` pin lives in **`canonical-commands.md`**, not its own file. Fires most often when the user *corrects an improvised command* ("no — use `gh api …/comments --paginate`, you missed comments again"): that correction is a candidate pin.

Route it through §5a's overlay-tier choice, but the destination is a **section appended to the tier's `canonical-commands.md`**, not a new per-rule file:

| Tier | Destination |
| --- | --- |
| user / company | `…/architectural-rules-{local,company}/universal/canonical-commands.md` |
| project | `<repo>/CLAUDE.md` `## Canonical commands` section, or `<repo>/.claude/canonical-commands.md` — project pins override universal ones |

Draft the entry in that file's strict shape — `### <verb>`, a fenced command block, then a **mandatory** `**Why:**` line (the rationale is what lets the agent adapt; a pin without it is the slop case). Before writing, **redact** per §-redaction: a pinned command must be safe to commit, so a token / API key / internal URL in the command is rejected — force an env var or placeholder. If the verb already has a pin, this is an *override*: surface the existing entry and confirm intent (same as §5a's override flow).

### 6. Draft

Build the frontmatter per `claude-md/memory-capture.md`'s template exactly — `relations` (if any) is populated by step 6a.

**Always quote the `description` value** (and any frontmatter scalar that may contain `:` `#` `[` `]` `{` `}` `&` `*`). An unquoted `description:` with a `: ` inside parses as a nested YAML map, fails, and the loader **silently drops the whole memory** from the corpus. Default to double-quoting descriptions; it is never wrong to quote.

Body: **rule + why + scope**, in the **model-optimized compressed form** — memory bodies are read by models, not humans. Follow [`docs/memory-compression-spec.md`](../../docs/memory-compression-spec.md): hybrid by field (`description` + MEMORY.md hook stay human-legible — they are the discovery signal; the body goes terse shorthand), and the **misapplication test** for the why-line:

> Keep the why iff removing it would let a future model misapply the rule. Drop it when the rule self-enforces.

For `type: feedback` and `type: project` bodies, the `**Why:**` / `**How to apply:**` lines apply *through that test* — keep the why compressed (`why: <terse cause>`) when load-bearing, fold/drop `how-to-apply` unless it adds a firing condition the rule doesn't already imply. `kind: warning` bodies always keep their (compressed) incident anchor — it is what makes a warning a warning.

### 6a. Cross-memory relations

Propose `relations:` to existing memories by reading [relations.md](relations.md). Confirm `supersedes` with the user before writing; propose the rest.

### 6b. Bloat budget guard (write-time)

Before proposing, run two checks so bloat cannot enter the corpus at the source (see `docs/memory-compression-spec.md` and `/memory-audit` dim 10):

**Body-size budget.** Measure the drafted body (bytes, excluding frontmatter):
- **≤ ~600 B** → fine, proceed.
- **600–1000 B** → acceptable only if the content genuinely needs it (a table, a multi-case rule, an incident anchor). If it's prose that could compress, compress it first.
- **> ~1000 B** → over budget. Re-compress per the spec before proposing. If it still exceeds after honest compression, the memory is probably **two memories** — split it. Never propose an >1000 B body without either compressing or flagging *why* it must be large in the proposal.

**`relevance: always` challenge.** If the draft sets `relevance: always`, justify it explicitly: *"does this genuinely apply every single session, or only when touching a domain/phase?"* — every `always` entry is paid every session. Default to a scoped/phase relevance (`when-touching-X`, `during-review`) unless the rule is a load-bearing discipline that fires regardless of task. Finished-work facts, tool-specific gotchas, and domain rules are **never** `always`. State the justification in the proposal so the user can veto.

Guards, not gates — the user can override in §7, but the check must *run* and its result must appear in the proposal.

### 7. Propose

Show the user:
- **Target path** — where the file will land (absolute or `~/`-relative).
- **Full frontmatter and body** — no placeholders.
- **MEMORY.md index line** that will be appended (if applicable — see §8).
- **Budget line** (§6b) — body size vs budget, and the `relevance: always` justification if applicable.

Ask: *accept / edit / reject*.

### 7a. Pre-write secret scan

Before every write, read [secret-scan.md](secret-scan.md) and run it on the drafted body. A hit pauses the write; the user picks redact, edit, abort or ignore per match.

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

More in [reference.md](reference.md): failure modes, What capture does NOT do.
