# Plan / Execute workflow — reference

Codifies the `spec → plan → execute → review` workflow as user-invoked building blocks. Convention, not framework.

## What this owns

- The sequencing of `/spec` → `/draft-plan` → `/execute` → `/review` for non-trivial work.
- The *when-to-skip* rule (Anthropic's "describe the diff in one sentence → skip the plan").
- The versioned `.claude/specs/<slug>/v<N>.md` and `.claude/plans/<slug>/v<N>.md` file contracts, and the INDEX.md registry per tree.
- The verification discipline inside `/execute`.
- Subagent delegation heuristic for research-heavy or file-heavy steps.

## What this does not own

- **Rule storage** — lives in the architectural-rules tree and memory (001/011).
- **Rule retrieval** — discover.
- **Rule priming before code** — prep (004, formerly "grounding").
- **Drift detection after code** — review.
- **Memory capture** — capture.
- **Tool protection** — security hooks.

The workflow is a *sequencer* across those organs. It does not replace any of them.

## The four phases

```
[user idea]
 ↓
/spec → SPEC.md (interviewed) ← phase 1: surface requirements
 ↓
[fresh session recommended]
 ↓
/draft-plan → PLAN.md (reviewable) ← phase 2: decide the shape
 ↓
[user reviews the plan]
 ↓
/blueprint → intent + concrete shape (optional) ← phase 2.5: commit the shape before coding
 ↓
/execute → implementation + verification ← phase 3: do it, gate each step
 ↓
/review → drift check ← phase 4: audit for drift
 ↓
commit → one concern per commit
```

### Phase 1 — /spec

Interview the user with `AskUserQuestion`. Probe technical implementation, UI/UX, edge cases, constraints, tradeoffs. Skip obvious questions. Stop when the user signals done or coverage is complete. Before writing, invoke `discover` to fold in relevant prior knowledge.

Output: `.claude/specs/<slug>/v<N>.md`. Sections: Problem, Goals, Non-goals, User-facing behavior, Technical approach, Constraints, Grounded context, Open questions, Verification criteria. Plus a `Changes from v<N-1>` section on evolutions.

Specs evolve — `/spec <slug>` defaults to evolving the active version (interview only on diffs, write `v<N+1>`, mark old version `superseded`). Old versions are kept for archaeology. `/spec <slug> --abandon` marks the slug abandoned without writing a new file.

`/spec` does NOT implement. It writes the file and updates `.claude/specs/INDEX.md`, then stops.

### Phase 2 — /draft-plan

Read the active spec for the slug (`.claude/specs/<slug>/v<M>.md`), or fall back to a `--task` description with a warning. Invoke `prep` to load architectural rules. Invoke `discover` to load memory + codemap. Draft steps — each with files, outcome, verification.

Triviality check: one-paragraph spec + one-step change + no architectural risk → ask the user to skip plan/execute and just do it.

**Review gate (before write).** The drafted plan is held in-conversation and presented for review — *accept / edit / reject* — before any file is written. Presentation scales with plan size: small plans (≤ 6 steps) render inline; larger plans render a one-line-per-step outline with an option to pull the full body inline, write-and-open, or edit a step; a terse `--quiet` mode asks a single review-or-write prompt. *edit* applies prose changes ("drop step 3", "swap 4 and 5") to the draft and re-presents; *reject* discards without writing. Only the accepted plan becomes `v<N>.md` — there is no draft scratch file. This is the same propose-confirm-commit discipline recap / capture / rules / memory-audit follow; the plan is the last cheap checkpoint before `/execute`.

Output: `.claude/plans/<slug>/v<N>.md`, with frontmatter `spec:` pinning the exact spec version this plan was drafted against. Plans always evolve as a new version (no `--evolve` / `--new` distinction) and supersede the previous active plan for the same slug. The plan file format is the contract between `/draft-plan` and `/execute` — see [skills/execute/SKILL.md](../skills/execute/SKILL.md) step 1 for the parser's expectations.

### Phase 2.5 — /blueprint (optional)

`/draft-plan`'s close offers it; the user invokes it explicitly. `/blueprint <slug>` authors a **concrete blueprint** — **what we wanted** (intent from vision + spec) and **what we're building now** (the mature concrete shape: classes, interfaces, dependencies, module relationships, build order) with Mermaid UML — from the vision + spec + plan, *before coding*. It does **not** merge with the plan: the plan says *what steps to take*; the blueprint shows *the concrete shape to commit to*, with an alignment check that the shape still serves the intent. Output is presented for accept/edit/reject (same review gate as the plan), then written to `.claude/docs/<slug>/v<N>.md` (spec-pinned) and the Obsidian vault. A `--from-code` mode re-blueprints an unspecced existing system from code + codemap, with inferred runtime flows labelled. This is the *authoring* counterpart to `codemap-visualize`'s post-hoc structural render — see [skills/blueprint/SKILL.md](../skills/blueprint/SKILL.md). Optional and skippable; small plans rarely need it.

### Phase 3 — /execute

Choose an execution strategy up front — `--strategy sequential|subtask|multi-agent` (multi-agent routes to `/orchestrate`) + a prompting cadence `--cadence per-step|on-failure-only|milestones`; default is sequential + per-step, so it's additive. Then run the plan step-by-step. Per step:
1. Re-prep if crossing a module boundary.
2. Offer subagent delegation if tagged `[delegate]` / `[research]` or touches >5 files.
3. Implement the change.
4. Run the verification. Pass = advance. Fail = stop, surface, ask.

User-attested verifications (UI, "looks right") never self-attest — always ask the user to confirm pass. Never advance on author's word.

### Phase 4 — /review

After execute completes, user invokes `/review` to audit for drift. Review is the guard against "it works, but it's ugly" — reports dead code, monolith risk, SoC violations, missing patterns, principle violations, comment drift. Per-finding propose-confirm-commit.

`/execute` prompts for review at the end but does not auto-run it.

### Phase 4.5 — /checkpoint (optional)

After building, `/checkpoint --scope module` steps back over the just-built module(s): did it drift from the intent, do the pieces **cohere** (integration-fit), is it still worth it, what was learned. Where `/review` checks *code vs rules*, `/checkpoint` checks *work vs intent* + cross-module fit — a different lens. Optional; reach for it after a multi-module build. (See [checkpoint-organ](checkpoint-organ.md).)

### Phase 5 — /close-out (the terminus)

Once the work has actually shipped (done-criteria met), `/close-out <slug>` **closes the chain**: it reconciles the spec to what really shipped (a new `as-shipped` spec version — your original intent stays readable as the prior version), retires the spent plan + blueprint to a dated `.claude/archive/` folder, and logs **one** ship line to `CHANGELOG.md`. `/execute` offers it for you when a plan finishes. Where Phase 1's done-criteria *opened* the boundary ("what does done mean"), `/close-out` *closes* it ("done — here's what's now true, the working files are filed away"). Never auto-fires; every spec edit and file move is confirmed first. (See the [`close-out` skill](../skills/close-out/SKILL.md).)

### Which closing organ, when? (the three are not the same)

Three organs fire near the end of work, and they're easy to confuse. They differ by *what they're about*:

| Organ | About | Does | Use when | | --- | --- | --- | --- | | **/recap** | the **session** | writes a "what we did today / where we left off" note | wrapping up a work session (may span several features, or half of one) | | **/close-out** | a **feature** (slug) | reconciles its spec to reality, files away its plan, logs the ship | that *specific feature* has shipped | | **/checkpoint** | a **scope** (a diff / module / the whole project) | audits "does this serve the point + cohere?" and routes fixes | you want to step back and judge fit, at any zoom | Rule of thumb: **`/recap` = the session, `/close-out` = the feature, `/checkpoint` = the judgment.** They compose — a session-end `/recap` will *offer* `/close-out` for any feature that shipped during it.

## When to skip

Anthropic's rule: *"if you could describe the diff in one sentence, skip the plan."*

Applied in practice:

| Task shape | /spec | /draft-plan | /execute | | --- | --- | --- | --- | | One-line change (rename var, fix typo) | skip | skip | skip — just do it | | Single file, clear scope | skip | skip | /execute or just do it | | Multi-file change with a clear target | skip | /draft-plan | /execute | | Unclear requirements, multi-phase | /spec | /draft-plan | /execute | | Refactor across boundaries | /spec (light) | /draft-plan | /execute | The triviality check inside `/draft-plan` enforces the rule automatically for the first two rows.

## File conventions

Versioned, per-slug. Two parallel trees under `.claude/`:

```
.claude/
├── specs/
│ ├── INDEX.md # registry: slug → current version + status
│ └── <slug>/
│ ├── v1.md
│ ├── v2.md
│ └── v3.md # currently active
└── plans/
 ├── INDEX.md
 └── <slug>/
 ├── v1.md # spec:../../specs/<slug>/v1.md
 └── v2.md # spec:../../specs/<slug>/v3.md
```

**Frontmatter contract** (every versioned file):

```yaml
---
slug: <slug>
version: <N>
status: active # draft | active | superseded | abandoned
supersedes: v<N-1>.md # omit on v1
superseded_by: v<N+1>.md # added when the next version takes over
created: YYYY-MM-DD
description: <one-line — used by INDEX>
---
```

Plans additionally carry `spec:../../specs/<slug>/v<M>.md` pinning the spec version they were drafted against. A plan does not silently update when its spec evolves — re-run `/draft-plan <slug>` to produce a new plan against the new spec.

**Status transitions:**
- `draft → active → superseded` is the normal evolution path.
- `* → abandoned` is an explicit dead-end (kept for archaeology, never resurrected silently).
- Exactly one version per slug carries `status: active` at any time.

**INDEX.md** is regenerated from frontmatter on every `/spec` or `/draft-plan` invocation. Do not hand-edit; the next invocation reconciles drift.

**Reserved slug `default`.** A slug is not always meaningful — for one-off small projects or single-feature work, the project itself is the scope. `/spec`, `/draft-plan`, and `/execute` with no argument resolve to the reserved slug `default` (when it exists / is active). Mixing `default` with named slugs (`auth-rework`, `billing`) in the same project is supported. The user / Claude decide whether to use `default` or named slugs based on project scope and how many parallel specs are in flight.

**Default sync:** the trees are tracked in git as decision artefacts. Add `.claude/specs/` or `.claude/plans/` to `.gitignore` if you want a slug local to your machine — that is the user's call, not the skill's. (The "sync is user choice" feedback applies: skills never edit `.gitignore` on the user's behalf.)

**Legacy SPEC.md / PLAN.md:** the old single-file layout at project root is still readable. `/execute` falls back to `PLAN.md` with a one-time deprecation note. `/spec` offers a one-time migration prompt (move the legacy file into `.claude/specs/<slug>/v1.md` and build INDEX) on first invocation.

**Path overrides:** v1 does not support per-project path overrides. The trees live at `$CLAUDE_PROJECT_DIR/.claude/specs/` and `.claude/plans/`. If you need them elsewhere, symlink the `.claude/` directory.

## Session boundaries

Anthropic recommends fresh context per phase. `/spec` prompts the user to start a new session before `/draft-plan` — that keeps the planner from inheriting interview-context noise.

`/draft-plan` does NOT force a new session before `/execute` — the plan file itself is the context hand-off. Execute can run in the same session as plan with no context leakage, because execute's input is the file, not the prior conversation.

## Subagent delegation

`/execute` delegates a step to a fresh subagent when:
- Step is tagged `[delegate]` in the plan.
- Step is tagged `[research]`.
- Step touches >5 files.

At the moment of delegation, the user is asked to confirm. Default-on, user-interruptible.

Subagent returns a summary. Execute integrates the summary, then runs the verification in the main context — never accepts the subagent's "it's done" unverified.

## Verification discipline

Three verification shapes:

- **Command-shaped** — `tests in X pass`, `npm run build exits 0`. Automatable. Execute runs the command and reads the exit code / output.
- **Artifact-shaped** — `file X contains function Y`, `export Z is present`. Verified with Read + Grep.
- **User-attested** — `button renders red`, `loading feels smooth`. No automated test possible. Execute asks the user to confirm pass; never self-attests.

Steps without a verification line cause `/execute` to stop before touching any code. Anchoring on verification is the discipline this workflow enforces — matches decisions.md line 120 "verification-as-default principle."

## What this is not

- **Not a heavy framework.** No `.planning/` directory, no per-step state files, no complex dependencies between steps. Three commands + one skill + a file contract.
- **Not a specific community workflow reimplementation.** Adopted from Anthropic's official guidance; implemented per Default Option B (see decisions.md #build-principles).
- **Not auto-fired.** All three commands are user-invoked. No "Claude detected this is a big task, automatically running /spec." That magic breaks in unexpected ways.
- **Not a replacement for Claude Code's Plan Mode.** Plan Mode is the in-context read-only planner. Our `/draft-plan` writes a file you can review, edit, and revisit. Complementary.
- **Not a progress tracker.** Execute does not save partial state. If you abort mid-run, re-run `/execute --from N` from whatever step is next.

## Debug

- **`/spec` interview feels too long** — the soft cap is ~10 questions. If you're hitting the meta-question (*"are there areas we haven't covered?"*) and still want to stop, say so. The skill respects it.
- **`/draft-plan` keeps triggering the triviality check on real work** — the heuristic is one-paragraph spec + one-step change + no risk. If your work meets all three criteria, it's probably genuinely small — but if you disagree, `y` at the prompt proceeds.
- **`/execute` fails on the first step** — most likely either the verification command itself is wrong (fix the plan) or the architectural rules loaded by prep are wrong for the scope (use `/prep` manually with a clearer scope hint).
- **Subagent delegation feels premature** — decline the `y/N` prompt. The heuristic is a default, not a mandate.
- **Execute cannot find a plan** — check `$CLAUDE_PROJECT_DIR`. If env var is unset, execute falls back to cwd. Use `/execute <slug>` to resolve via INDEX, or `/execute <path>` for an explicit version file. The legacy `PLAN.md` at project root still works with a deprecation note.

- **INDEX.md is stale or missing** — re-run `/spec <slug>` or `/draft-plan <slug>` (no-op evolutions are fine). INDEX is regenerated from on-disk frontmatter every invocation, so any one /spec or /draft-plan call reconciles it.

## Related

- Commands: `commands/spec.md`, `commands/draft-plan.md`, `commands/execute.md`.
- Skill: `skills/execute/SKILL.md`.
- One-pager: `docs/_implementing/010-onepager.md`.
- Upstream organs consumed: [prep](prep-organ.md), [discover](discover.md), [review](review-organ.md), [capture](capture-organ.md).
