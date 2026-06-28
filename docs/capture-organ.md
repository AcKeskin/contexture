# Capture — the capture organ

Authoritative procedure lives in [`skills/capture/SKILL.md`](../skills/capture/SKILL.md); this doc is the Claude-facing reference.

## What capture owns

The **propose-confirm-commit flow** for turning a triggering moment (a correction, a lesson, a decision, a preference) into a stored memory file with correct frontmatter and folder placement.

Capture *writes*; discovery reads. Classification quality at capture time dictates retrieval quality later.

## What capture inherits

Capture does not redefine discipline that already lives elsewhere. The organ leans on:

| Concern | Source | What it contributes | | --- | --- | --- | | Frontmatter schema (`name`, `description`, `type`, `kind`, `scope`, `relevance`) | 001 | Template and field semantics | | Folder layout (`feedback/`, `project/`, `lessons/`, `decisions/`, `preferences/`, `architectural-rules/<scope>/`) | 001 | Where each `kind` / `type` lands | | Compression discipline (rule + why + scope, drop ceremony) | 001 | Body voice | | `kind` taxonomy (`lesson` / `decision` / `architectural-rule` / `preference`) | 006 | Kind values and their folders | | Architectural-rule tree (`~/.claude/architectural-rules/<lang-or-domain>/`) | 006 | Target for universal / language / domain rules | | User-correction feedback trigger | 005 (pending) | Invokes capture when review catches a missed rule | Capture's job is to apply all of the above consistently — not to reinvent any of it.

## Invocation shapes

| Form | Who | What happens | | --- | --- | --- | | `/capture <text>` | User | `<text>` is the candidate memory content. | | `/capture` | User | Infer content from recent turns; ask one clarifying question if ambiguous. | | Natural language: "remember that…", "save this" | User | Description match triggers the skill. | | Programmatic (another skill) | Review, future | Caller passes structured content + suggested classification. | Never auto-fired. See §"Mode A vs Mode B" below.

## The flow

1. **Classify** — pick `type`, `kind`, `scope`, `relevance` from the content and triggering context.
2. **Decide target** — project memory vs. global tree (`~/.claude/architectural-rules/` for rules, `~/.claude/memory/` if present for other globals). Ambiguous → ask.
3. **Draft** — full frontmatter + body, compression discipline applied.
4. **Propose** — show target path, frontmatter, body, and the `MEMORY.md` index line that will be appended (if applicable). Ask accept / edit / reject.
5. **Commit** — on accept: write file, update index, report. On edit: loop. On reject: discard.

See [`skills/capture/SKILL.md`](../skills/capture/SKILL.md) for the procedural detail.

## Mode A vs Mode B

- **Mode A — Deliberate capture.** The only mode implemented. Every capture is user-invoked or skill-invoked, and every capture requires user confirmation before a file is written. Collaborator principle.
- **Mode B — Episodic auto-capture.** **Parked**, for two reasons: (1) designing the trigger set requires real session data to distinguish signal from noise, and (2) silent auto-capture violates the collaborator principle unless very narrowly scoped.

Mode B is revisited once v1 is in use and there is evidence of what genuinely gets lost. Until then, episodic content is captured via `/recap` (shipped) — a user-confirmed end-of-session summary, not a silent stream.

## Feedback vs preference — folder split

A point of confusion worth pinning: both `type: feedback` and `kind: preference` are about "how the user wants things done." The folder layout is explicit:

- **`feedback/`** — keyed on `type: feedback`. Uses the `**Why:** / **How to apply:**` body shape. User-given rules with incident-backed reasoning.
- **`preferences/`** — keyed on `kind: preference` (with `type: user`). Lighter-weight style notes.

When in doubt: incident-backed rule from a correction → `feedback/`; lightweight style preference → `preferences/`. Capture skill respects this split deterministically.

## Relationship to discovery

Capture is the write path; discovery is the read path. A poorly classified capture returns poor discovery matches later — there is no correction mechanism short of manually editing the file. Treat classification as load-bearing and lean on user confirmation to catch mistakes before they bake in.

## Relationship to architectural rules

`kind: architectural-rule` captures target the global tree (`~/.claude/architectural-rules/<scope>/`), not per-project memory. Capture must recognise the universal / language / domain / project split from 006 and route accordingly. For project-specific architectural rules, the two homes are (a) per-project memory with `scope: [project-<name>]` or (b) the project's `.claude/architecture.md` file (version control is user's choice). Capture writes memories; it does not edit `.claude/architecture.md` unless the user explicitly asks.

## Relationship to session recaps

Session recaps are written by the `/recap` flow, not `/capture`. Recaps are a different memory shape (episodic, structured fields, per-session file). Their `Learned` section is a promotion candidate — lessons surfaced there can later be re-captured as rule-tier memories via this skill.

## What capture does not touch

- Does not read stored memory (discovery's job).
- Does not auto-fire on any event.
- Does not mutate existing memories except lazily (when editing an old file for another reason, per `memory-capture.md`).
- Does not edit `.claude/architecture.md` (that file is canonical project documentation, edited deliberately).

## Debug

- File not where expected: check the `type` vs `kind` distinction in SKILL step 1–2. `feedback/` wins over `preferences/` for user-given rules.
- `MEMORY.md` index drift (duplicate or stale lines): the skill appends, it does not dedupe. If lines pile up, prune manually — future helper deferred.
- Capture proposes the wrong scope: the task context likely lacked keywords. Reinforce with an explicit `/capture <text>` form that includes the target scope verbatim.
