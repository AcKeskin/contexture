---
name: new-agents-md
description: Generate a vendor-neutral AGENTS.md (and a global AGENTS.md) by projecting this Claude-Code instruction corpus — CLAUDE.md tree, architectural rules, warning/feedback landmines, canonical commands — into a flat file other coding agents (Codex, Cursor, Aider, …) can read, then interviewing only for the gaps the corpus can't know (exact dev commands, repo-specific "never X", architecture orientation, infra hints). Use when the user types /new-agents-md or asks to create / generate / scaffold an AGENTS.md, or to make the repo readable by non-Claude agents. Mode A only — never auto-fire.
---

# new-agents-md

The cross-tool projection organ. Closes the gap that the entire instruction surface here is
Claude-Code-exclusive: `CLAUDE.md`, the `@claude-md/...` imports, the
`~/.claude/architectural-rules/` loader, the typed-memory `warning`/`feedback` corpus, and every
skill are invisible to any other coding agent. The moment a non-Claude agent (Codex, Cursor,
Aider, Continue, Zed) is pointed at a repo, it starts blind and guesses exactly what the corpus
already pins — test commands, package manager, the "never commit AI attribution" landmine, the
architectural defaults.

This skill projects the lean corpus into a vendor-neutral, repo-root `AGENTS.md` (plus a global
one) that those agents read on session start. It is a **distill-then-interview** organ: it reads
the corpus and proposes a draft *before asking anything*, then interviews only for what no corpus
read can supply.

## When to run

- User types `/new-agents-md` (explicit trigger).
- User says "generate an AGENTS.md," "make this repo readable by Codex/Cursor/Aider," "scaffold
 cross-tool instructions," "I want a vendor-neutral agents file."
- Do **not** auto-fire. No session-start or event-hook triggers. Mode A only — every run goes
 through the full distill + interview. (Trigger lives in the frontmatter `description` per
 `universal/skill-auto-fire.md`; there is no SessionStart hook.)

## Why this skill exists

The cross-tool convention is `AGENTS.md` — a vendor-neutral, repo-root instruction file. The
naive fix from the convention's write-ups is "make `AGENTS.md` canonical and reduce `CLAUDE.md`
to a thin `@AGENTS.md` stub." **That stub-inversion is rejected here.** The value of this
environment lives in machinery a generic agent cannot execute — on-demand rule loading,
discovery/prep organs, typed memory, skills. A generic reader can run none of it, so `AGENTS.md`
cannot `@import` the essentials; it must carry a **flattened, behaviour-only projection** of the
corpus.

Hand-maintaining that projection beside the live corpus would reintroduce the duplication that
single-source-of-truth exists to avoid — a stale hand-copied `AGENTS.md` is worse than none. So
`AGENTS.md` is treated as a **derived artefact** (like a codemap: regenerate on demand), not a
hand-maintained twin (like memory: authored, versioned). This skill is the generator.

`CLAUDE.md` + the organ machinery stay canonical for Claude Code. `AGENTS.md` is a downstream
projection for everyone else.

## Inputs

1. **Triggering message.** Anything after `/new-agents-md` is hint text (e.g. a path, or "global
 only") — used to bias the run, never to skip a pass.
2. **The corpus** (read in Pass 1, never written): the `CLAUDE.md` tree (global
 `~/.claude/CLAUDE.md` + project `<repo>/CLAUDE.md` + their `@`-imports), the architectural-rules
 tree in *resolved* form, the `warning/` + `feedback/` memory entries, and the
 canonical-commands file if it exists.
3. **The repo** (scanned in Pass 1 for language/domain detection; read in Pass 2 for architecture
 orientation): file extensions, directory layout, an existing `.claude/codemap.md` if present.
4. **Config.** The global-`AGENTS.md` destination path is read from machine-local config
 (`~/.claude/hook-config.json`), never hardcoded — see "Write & pointer" and
 `universal/no-hardcoded-machine-paths.md`.

## Procedure

### Pass 1 — Distill (read the corpus, propose a draft)

This pass runs **before any interview prompt**. It produces a non-empty draft `AGENTS.md` (and a
draft global `AGENTS.md`) held in-conversation. Read order:

1. **`CLAUDE.md` tree.** Read global `~/.claude/CLAUDE.md`, the project `<repo>/CLAUDE.md`, and
 every file they `@`-import. **Inline the import targets** as flat imperative prose — the
 generic reader cannot follow `@claude-md/...`, so the *content* goes in, not the reference.
 These become the Core-principles / conventions section.
2. **Architectural rules — resolved form.** Load rules via `skills/discover/SKILL.md`, so the
 overlay is already applied: user/company/project overrides + patches in, disables
 dropped, `<!-- id: -->` anchors stripped. **Never read the raw shipped tree** — a rule the user
 disabled or patched must project in its *effective* form, not its shipped form. Invoke discover
 programmatically (same call shape prep/review use):

 ```
 {
 task_keywords: [<derived from repo: languages, top-level dirs>],
 scopes: [<detected language>, <detected domain>, "global", "project-<name>"],
 kind: "architectural-rule",
 relevance_phases: ["always"],
 top_n: 20,
 render_bodies: true,
 include_recaps: false
 }
 ```
 - Projection depth (resolved per spec): **always-tier + detected-language + detected-domain**.
 - **Language detection** = file-extension scan of the repo, mapped to the language-tier folders
 that exist under `architectural-rules/` (e.g. `.cs` → `csharp/`, `.rs` → `rust/`, `.ts`/`.tsx`
 → `typescript/`, `.py` → `python/`, `.cpp`/`.h` → `cpp/`, `.sh` → `bash/`, `.sql` → `sql/`).
 This mapping is **non-exhaustive** — read the current set of language folders from
 `architectural-rules/` rather than treating this list as complete. Inline the language tiers
 for languages actually present.
 - **Domain detection** is a weaker signal than file extensions. Do **not** guess silently:
 gather candidate domains (from top-level directory names, module keywords) and **confirm them
 with the user in Pass 2** before inlining. Default to inlining none until confirmed.
3. **Landmines.** Read the `warning/` and `feedback/` memory entries. These become the **"Never X"
 critical-rules block at the top of the file** (lead-with-prohibitions). Each projects as the
 rule + its one-line "why" — the why is what lets a stateless reader generalise.
4. **Canonical commands.** If `architectural-rules/universal/canonical-commands.md` exists, project its verb→command pins into the Dev-commands section as a *seed* the
 Pass-2 command interview confirms. If absent, the command section starts empty and Pass 2 asks
 cold.
5. **Domain glossary.** If a project-tier glossary (`<repo>/.claude/rules/glossary.md`) exists, project its ubiquitous-language terms into the **`## Domain Language`** section —
 term → one-line definition, so a non-Claude agent shares the project's vocabulary. Drop the
 per-term code-symbol map (the generic reader wants the meaning, not the Claude-internal link).
 Absent → omit the section entirely.

Compose the draft in the required order (see Compose). The draft is a starting point, not a
finished file — Pass 2 fills the gaps.

### Pass 2 — Interview (fill only what the corpus can't know)

Soft-rejection forcing functions, matching the `new-agent` rhythm (re-show the example, re-ask
once; after two soft rejections accept whatever the user gives — forcing function, not gatekeeper).
Four gap categories:

1. **Exact dev commands.** The corpus names verbs; the repo names commands.

 ```
 What are the exact commands for: test / lint / typecheck / build / run?
 Which package manager (and any "use X not Y" rule)?
 What's the required post-edit check order?
 ```

 If the canonical-commands seed (Pass 1 step 4) pre-filled any of these, **confirm-or-edit**
 rather than asking cold: "Pinned command for tests is `<X>` — correct for this repo? (y/edit)".

2. **Repo-specific "Never X".** The reactive-rule pattern — landmines born from *this repo's*
 mistakes that aren't yet typed memories.

 ```
 What are 3–5 repo-specific "never do this" rules, each with the symptom if it slips through?
 (These join the corpus warning/feedback landmines at the top of the file.)
 Blank line to finish.
 ```

 **Collect these — do not capture yet.** They are batched at the end (see Capture batch).
 Soft-reject entries with no symptom clause (the symptom is what makes it real).

3. **Architecture orientation.** Where things live, not why.

 ```
 One paragraph: what is this project? Then a directory-purpose map and any path-alias / import
 conventions.
 ```

 **Seed from codemap when present:** if `.claude/codemap.md` exists, propose its structure tree
 as the directory map and ask confirm-or-edit. If absent, **degrade gracefully** to a cold ask —
 never fail because there's no codemap.

4. **Non-code infra hints.** The class of knowledge the corpus has none of.

 ```
 Any infra/workflow hints a fresh agent needs? (e.g. "API server runs in tmux window 3",
 "dev server live-reloads — don't restart it", "when I say 'commit' use the X skill")
 Blank line to skip.
 ```

### Size check (advisory, never blocking)

After distill + interview, estimate the projection size. The guidance threshold is **~3k tokens**
— a *soft budget*, not a hard cap. If the projection crosses it (typically a polyglot +
multi-domain repo with several language and domain tiers inlined):

```
This projection is ~<N>k tokens across <M> language tier(s) and <K> domain tier(s).
That's heavier than the lean target (~3k). Options:
 (t)rim — keep only the primary language/domain tiers, drop the rest (I'll list what's dropped)
 (k)eep — keep the full projection
Choice?
```

The user decides. **Never silently truncate** a language or domain tier — overflow is always
surfaced. Below the threshold, no prompt fires. (Same advisory posture as the rest of the corpus:
surface, user decides, no enforcement.)

### Capture batch (one propose-confirm at the end)

The repo landmines collected in Pass 2 step 2 are durable corpus material, not just projection
content. Offer the **whole set at once** (not one prompt per landmine):

```
You named <N> repo-specific landmines. These can also become durable warning-kind memories via
/capture (so future Claude sessions get them, not just other tools reading AGENTS.md):

 1. <landmine 1>
 2. <landmine 2>
...

Capture which? (a)ll / (s)ubset — list numbers / (n)one
```

On `all` / a subset → invoke `skills/capture/SKILL.md` with the chosen landmines as candidate
`warning`-kind content; capture's own confirm flow runs. On `none` → skip. **Either way the
landmines are still written to `AGENTS.md`** — capture is the durable-corpus add-on, independent
of the AGENTS.md write. This is the loop that keeps `AGENTS.md` a *projection of* the corpus, not
a second source drifting beside it.

### Compose

Assemble each `AGENTS.md` in this order (lead-with-prohibitions):

```markdown
# AGENTS.md

<one-paragraph: what this project is>

## Never do this
<the warning/feedback landmines + Pass-2 repo landmines, each: rule — symptom/why>

## Commands
<exact dev commands: test / lint / typecheck / build / run, package manager, post-edit order>

## Architecture
<one-paragraph orientation + directory-purpose map + path-alias / import conventions>

## Conventions
<flattened always-tier + detected-language (+ confirmed-domain) rules, as imperative prose>

## Domain Language
<present ONLY when a project-tier glossary (`.claude/rules/glossary.md`) exists:
project the ubiquitous-language terms — term → one-line definition — so a non-Claude agent
shares the domain's vocabulary. Omit the whole section when there is no glossary. Project the
terms + definitions; drop the per-term code-symbol map (an AGENTS.md reader wants the meaning,
not the Claude-internal symbol link).>

## Working discipline
<fixed cross-tool behavioral patterns — see below. Project verbatim; these are vendor-neutral
and apply to any agent reading this file. Not interviewed, not corpus-derived.>

## Infrastructure
<non-code infra hints, if any>
```

The **Working discipline** section is a fixed block — it projects the durable, vendor-neutral
prompting patterns (`architectural-rules/universal/agent-instruction-authoring.md`) into a form a
generic agent can act on. Insert verbatim:

```markdown
- Run one tool/command at a time and read its actual result before the next. Do not chain
 actions on an assumed outcome — a wrong assumption compounds across chained steps faster
 than it surfaces.
- Attempt-vs-ask by ambiguity depth: if the request has one dominant reading, make a good-faith
 attempt and state the assumption you made; if there are two or more reasonable readings, or
 you'd be inventing requirements, ask before acting.
- Separate gathering information from changing things. For non-trivial work, plan first and get
 the plan confirmed before mutating files.
```

This is the only fixed-content section. Everything else in the file is corpus-projected or
interviewed; this block is constant because the patterns are tool-agnostic by construction.

**Output contract — verifiable, this is the DC1 gate:**
- **No `@`-imports** anywhere (import targets are inlined).
- **No organ / skill references** (`/prep`, `/discover`, "the capture organ", etc.) — the generic
 reader can't run them. Translate any rule that mentions an organ into the plain behaviour it
 encodes.
- Everything is **flat imperative prose** a stateless agent can act on in one read.
- The **"Never do this" block is first**.
- The **"Working discipline" block** is present and verbatim (the fixed cross-tool patterns) — it
 is the one section that does not vary by repo.

### Preview & write

Show each composed file as a preview:

```
About to write:
 <repo>/AGENTS.md (~<N> lines)
 <global-agents-path>/AGENTS.md (~<M> lines) ← if generating the global file

Preview (project AGENTS.md):
<full content>

Preview (global AGENTS.md):
<full content>

Proceed? (y/N — or name a section to revise)
```

On a section name → revise that section, re-preview. On `n` → ask which section. On `y` → write.

### Write & pointer

1. **Project `AGENTS.md`** → `<repo>/AGENTS.md`.
2. **Global `AGENTS.md`** → the path read from `~/.claude/hook-config.json` (key
 `agentsMdGlobalPath`). **If the key is absent**, do not guess a location — surface:

 ```
 No global AGENTS.md path configured. To generate the global file, set "agentsMdGlobalPath"
 in ~/.claude/hook-config.json (e.g. the directory your other agents read for global
 instructions). Skipping the global file for now; project AGENTS.md was written.
 ```

 Never hardcode a drive letter, username, or `~/.config` literal in this skill body
 (`universal/no-hardcoded-machine-paths.md`).
3. **Pointer line** → add ONE line to the project `<repo>/CLAUDE.md` (a signpost, **not** an
 `@import` stub):

 ```
 > Vendor-neutral instructions for other coding agents live in AGENTS.md (generated via /new-agents-md).
 ```

 If `CLAUDE.md` already has the pointer, leave it. If there's no project `CLAUDE.md`, skip the
 pointer (nothing to point from).

### Report

```
✓ AGENTS.md generated.
 Project: <repo>/AGENTS.md
 Global: <global-path>/AGENTS.md (or "skipped — agentsMdGlobalPath not configured")
 Pointer: <repo>/CLAUDE.md updated (or "skipped — no project CLAUDE.md")
 Captured: <N> landmines → warning-kind memories (or "none")

AGENTS.md is a derived projection — re-run /new-agents-md to refresh it when the corpus evolves.
```

Stop. Do not commit. Do not invoke `/review`. The files go into the next user-confirmed commit.

## What this skill does NOT do

- **Does not invert CLAUDE.md into a stub.** `CLAUDE.md` stays canonical for Claude Code; it gains
 a one-line pointer, not an `@AGENTS.md` redirect. The loader is Claude-specific — see Why.
- **Does not live-mirror or hook.** `AGENTS.md` regenerates on demand (re-run the skill), never via
 a watcher. Drift between corpus and projection is a re-run away; surfaced by `/review` or
 `/memory-audit`, never enforced.
- **Does not dump the full corpus.** On-demand language/domain rules beyond detected scope stay
 out. The file stays lean; the soft size budget surfaces overflow for the user to trim.
- **Does not auto-fire.** Mode A only. No SessionStart hook.
- **Does not invent content.** Exact commands and repo landmines come from the user; the corpus
 slice comes from real files. The skill structures and composes — it does not fabricate rules,
 commands, or landmines.
- **Does not hardcode the global path.** Read from config, with a "configure me" fallback.
- **Does not silently truncate.** Heavy projections trigger the advisory size-flag; the user trims.

## Relationship to other organs

- **discover** — Pass 1 reads architectural rules through discover's resolution path so the
 047 overlay is already applied. Do not re-resolve; do not read the raw shipped tree.
- **capture** — Pass-2 landmines route to capture (batched) so they land as durable
 `warning`-kind memories, not only in the projected file. Capture's own confirm flow runs.
- **prep** — when building or editing this skill, prep with `[skills, instructions]` scope.
- **review** — review can flag a stale `AGENTS.md` (older than its source corpus) as drift;
 it does not regenerate.
- **canonical-commands** — producer→consumer seam: 036 pins commands *inside* the
 corpus; this skill projects them *outward*. If 036 shipped, the command interview confirms from
 the pins; if not, it asks cold.
- **org profile** — a team-shared org-tier `AGENTS.md` floor layers under the
 repo's. Documented seam; not built here.
- **architectural-rules tree** — `universal/skill-auto-fire.md` (trigger in description) and
 `universal/no-hardcoded-machine-paths.md` (global path from config) both apply directly.
 `universal/agent-instruction-authoring.md` is the source of the fixed **Working discipline**
 block — re-projected into the emitted AGENTS.md so non-Claude agents inherit the same patterns.

## Anchors — house style

- `skills/new-agent/SKILL.md` — the structural template this skill clones (frontmatter trigger,
 interview rhythm, soft-rejection forcing functions, "does NOT do", relationship-to-organs).
- `skills/blueprint/SKILL.md` — the closest analog: reads upstream artefacts, composes, writes to
 `.claude/` + vault with a preview gate. Same distill-then-present-then-write shape.
