---
name: prep
description: Prime the session with architectural rules relevant to the current task — universal + language + domain + project rules — before writing code. Auto-fire on first substantive task of a session, first task after /clear, and when the user signals a topic shift ("now let's work on X"). Manual trigger via /prep. During subsequent work, observe drift (current request mentions a different module / domain / language, or about to touch files outside the primed scope) and ask the user before proceeding. Do not auto-fire on trivial questions or information requests.
---

# prep

The prep organ (previously "grounding"). Implements. Consumes [discover (002)](../discover/SKILL.md), [deliver (012)](../deliver/SKILL.md), the [architectural-rules tree (006)](../../architectural-rules/README.md), and project `.claude/architecture.md` (when present, per [project-architecture.md](../../docs/project-architecture.md)).

Prep **prevents** drift by priming Claude with the rules *before* code is written. Review (005) **detects** drift after the fact. Different jobs, complementary.

## When to run

**Auto-fire** (the description field above drives this — Claude reads it and fires the skill at the right moment):

1. **First substantive task of a session.** A substantive task is a code-writing, design, debugging, or review request. Trivial questions, lookups, and "what is X" style prompts do *not* trigger prep.
2. **First substantive task after `/clear`.** Context was wiped; re-prime.
3. **User signals a topic shift.** Phrases like "now let's work on X", "switching to Y", "different question about Z" where Z is a new domain / language / project.

**Manual fire:**

4. User types `/prep` (explicit trigger, e.g. when Claude failed to auto-fire, or the user knows they are about to shift).
5. User asks "prep for this" / "load architectural rules" / "prime for X".

**Do not auto-fire on:**

- Session start itself (nothing to prep against yet).
- Trivial questions / pure information requests ("what does git reflog do?").
- Every message — prep is *per-task*, not per-turn.

## Inputs

- **Task text.** The substantive request that triggered prep. If invoked manually via `/prep [scope-hint]`, use the hint to bias scope detection.
- **Working directory.** `$CLAUDE_PROJECT_DIR` if set, otherwise `cwd`. Determines project context and whether a `.claude/architecture.md` is available.
- **Recent session state.** Earlier turns in the same session (for topic-shift detection).

## Procedure

### 1. Identify task scope

From the task text + project context, determine:

- **Task type** — one of: `code-writing`, `design`, `debugging`, `review`. Drives `relevance_phases` filter to discover.
 - Code-writing: explicit "implement", "add", "write", "refactor", "fix".
 - Design: "design", "plan", "how should we structure", architectural questions.
 - Debugging: "debug", "not working", "fails with", error traces.
 - Review: "review", "look over", "check this code".
 - Default when ambiguous: `code-writing`.
- **Language(s).** From file extensions mentioned in the task, cwd-visible repo indicators (`package.json`, `*.csproj`, `CMakeLists.txt`, `.unity` packages), codemap, or explicit mention. Multiple allowed.
- **Domain(s).** From module names (`api`, `ui`, `rendering`, `auth`), task keywords, file paths. Multiple allowed.
- **Project.** The current working directory's project. If `<project-root>/.claude/architecture.md` exists, flag it for explicit read in step 3.

When scope detection is thin (no clear language / domain / obvious keywords), fall back to `[global, universal]` only and note the thin detection in the priming block.

### 2. Build the discover query

Invoke [`skills/discover/SKILL.md`](../discover/SKILL.md) programmatically:

```
{
 task_keywords: [<derived from task text>],
 scopes: [<language>, <domain>, "global", "project-<name>"],
 kind: "architectural-rule",
 relevance_phases: [<task-type mapping>, "always"],
 top_n: 20,
 render_bodies: true,
 include_recaps: false
}
```

`relevance_phases` mapping:

| task type | phases | | --- | --- | | `code-writing` | `always`, `when-language-<lang>`, `when-domain-<domain>` | | `design` | `always`, `during-planning` | | `debugging` | `always`, `during-debug` | | `review` | `always`, `during-review` | `include_recaps: false` is deliberate — prep primes *what rules apply*, not *what I was doing last time*. Recaps are for the discover report, not the priming block.

Discover resolves the architectural-rule overlay as part of this call — the rules prep receives are already the *effective* corpus (user / company / project overrides + patches applied, disables dropped, anchors stripped). Prep does not re-resolve; it consumes the resolved set and carries any non-default annotations through to step 5.

### 3. Read `.claude/architecture.md` if present

If the project has `<project-root>/.claude/architecture.md`, Read it and treat its content as an additional fragment. Compose it with the discover output in step 4. Do not rely on discover to surface it — discover's codemap branch covers `codemap.md`, not `architecture.md`.

### 4. Merge, prioritise, cap

Combine discover's rendered fragments + the architecture file content.

**Sort** by specificity (highest → lowest):

1. Project-specific — `scope` includes `project-<name>` tag, or content is from `.claude/architecture.md`.
2. Domain — matched by `scope` containing a domain tag from step 1.
3. Language — matched by `scope` containing a language tag from step 1.
4. Universal — `scope` contains `universal` or `global`.

**Cap:**

- Hard cap at 20 rules. When more match, drop from the lowest-specificity tier first (universal → language → domain, never drop project-specific rules within the cap).
- Soft cap: priming block target < 500 tokens. If the 20-rule set exceeds this, drop lower-specificity rules until the block fits. Do not paraphrase — delivery's source-of-truth rule forbids it.

**Compression:**

- The architectural-rules tree already enforces rule-level compression at storage time ( + 006). Do not re-compress here.
- If the `.claude/architecture.md` content is long (>10 bullets), pull the most-relevant sections to the task; leave the rest for an explicit user request.

### 5. Surface the priming block

Output shape:

```
Prepped for: <language(s)> / <domain(s)> / project: <name>

Loaded N rules:
 Universal: <terse rule list, comma-separated or bulleted>
 Language: <terse rule list>
 Domain: <terse rule list>
 Project: <terse rule list>

Codemap age: X days. Architecture file: present | absent.
```

Rules lines use the rule's `name` field from frontmatter (short, memorable). When a rule's name alone is not self-explanatory, add its one-line description inline — keep each line terse.

**Overlay annotations — non-default only.** A rule overridden / patched / disabled / locked-diverged carries a short tag inline (`[user override]`, `[user patch −1~1+1]`, `[⚠ orphaned anchor]`, `[⚠ LOCKED divergence]`). Plain shipped rules carry no tag — the common case stays clean. This is the only addition to the priming block; it costs tokens only when something actually diverges from shipped.

**Empty-result shape** (no rules matched):

```
Prepped for: <detected scope>
No architectural rules matched.
Either this scope has no captured rules yet, or the task scope was misidentified.
Proceeding without priming. Run /prep manually if you want to provide context.
```

Show the priming block to the user before starting work. They see what was loaded and can correct if irrelevant ("you prepped for cpp but this is a TypeScript file — re-run with `/prep typescript`").

### 6. Record primed scope

Maintain a short in-context note — not a file, ephemeral per session:

```
Primed for: language=<lang>, domain=<domain>, project=<name>. N rules loaded.
```

Update this note every time prep re-runs. It is the comparand for the task-shift rule below.

### 7. Task-shift rule (continuous, not a one-time step)

Throughout subsequent work, observe:

- **Does the current request mention a different module / domain / language than the primed scope?**
- **Is Claude about to read or write files outside the paths implied by the primed scope?**
- **Has the user's intent clearly shifted topic** (even before files are touched)?

When any of those is true, stop and say:

> This looks like it may be moving outside the original scope (primed for **X**; now touching **Y**). Re-prep?

- User answers. On yes → re-run from step 1 with the new scope. On no → proceed with existing priming. Update the primed-scope note either way.
- **Budget:** at most one such prompt per 3 file operations in a row. Prevents thrashing when Claude is touching many files across modules.
- **False-positive cost is low** (user just says "keep going"), **false-negative cost is low** (user can `/prep` manually). Asymmetry favours asking — err on the side of surfacing.

No state tracking of file sets. No silent detection. Observe → surface → ask. Matches the collaborator principle.

### 8. Push-back handling (continuous, not a one-time step)

When the user corrects Claude with reference to a rule ("you violated SoC", "this imports /api directly — go via services", "that's not how we do naming here"):

1. Note the correction.
2. Identify whether the correction maps to:
 - **A rule already in the primed set.** Claude missed it — acknowledge, adjust the code, no capture needed (the rule exists).
 - **A rule not in the primed set but already captured.** Prep's scope detection missed it — acknowledge, offer to re-run `/prep` with broader scope.
 - **A rule that does not exist in the tree.** Propose a capture: *"This correction looks like a new rule. Capture it via `/capture`?"* — invokes [`skills/capture/SKILL.md`](../capture/SKILL.md) with the user's correction text as candidate content. Capture's own confirmation flow runs.
3. Never auto-capture. Collaborator principle.

## Failure modes

- **Scope detection returned `[global]` only.** The task was vague. Surface the thin detection explicitly in the priming block so the user can override. Do not guess a more specific scope.
- **Discover returned zero fragments.** Use the empty-result shape from step 5. Do not fabricate rules.
- **`.claude/architecture.md` is huge (>500 lines).** Read only the sections relevant to the task scope. If relevance is unclear, summarise: *"Project has a large architecture.md — loaded sections matching <scope>; the rest is available on request."*
- **Task-shift prompt fires too often.** Budget kicks in at 1-per-3 file operations. If budget is exhausted and drift still seems real, wait until the next file operation window rather than skipping acknowledgement entirely.
- **Push-back maps to no existing rule AND no clear captureable text.** Ask one clarifying question (*"Should this be a project-specific rule, a language rule, or a universal rule?"*) before proposing capture.

## What prep does NOT do

- **Does not monitor keystrokes or tool calls in real time.** Task-shift is observed at Claude's own judgement boundaries (about to read / write), not continuously.
- **Does not persist primed scope across sessions.** Ephemeral per session.
- **Does not review code for rule violations.** That's review (005). Prep primes; review audits.
- **Does not auto-capture new rules.** Push-back produces a capture *proposal*, never a silent write.
- **Does not substitute for the user's architectural judgement.** Surfaces rules, the user decides which apply in context.
- **Does not modify rule files.** Read-only over the architectural-rules tree.
- **Does not include session recaps.** `include_recaps: false` on the discover call. Recaps are episodic recall, orthogonal to rule-priming.

## Relationship to other organs

- **discover (002)** — prep's retrieval engine. Prep never re-implements discovery logic.
- **deliver (012)** — prep passes `render_bodies: true`; deliver handles tier ordering and caps within its own contract.
- **capture (011)** — push-back → capture proposal. Prep never writes directly.
- **architectural-rules tree (006)** — the corpus prep primes from. Prep's quality is bounded by the corpus's quality.
- **project-architecture.md (006)** — the project's canonical architectural file. Prep reads it directly (step 3), not via discover.
- **review (005)** — review consumes the same primed scope signal. For now, prep's primed-scope note is session-internal only.
- **recap (013)** — prep does not load recaps into the priming block. Recaps belong in `/discover`-style recall, not rule priming.
- **persist-before-discard rule + clear-context-decision-guard hook (049)** — prep surfaces `universal/persist-before-discard.md` like any other rule when the scope matches session-close. That rule is the intent-shaping half (don't *suggest* clearing with decisions pending); the `clear-context-decision-guard` SessionStart hook is the mechanical backstop (recover at next session start). Rule and hook must stay aligned — drift between them is a flag.

See [`docs/prep-organ.md`](../../docs/prep-organ.md) for the scope map and the rationale behind each rule.
