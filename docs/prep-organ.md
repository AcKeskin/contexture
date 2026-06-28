# Prep — the prep organ

Authoritative procedure lives in [`skills/prep/SKILL.md`](../skills/prep/SKILL.md); this doc is the Claude-facing reference.

(Naming note: the proposal and earlier docs used "grounding" for this organ. Renamed to "prep" — the command is `/prep`, the skill is `skills/prep/`, the folder naming throughout.'s filename is unchanged for git history continuity.)

Prep **prevents drift** by surfacing architectural rules before code is written. It is the first payoff proposal — every read-side organ (002 discover, 012 deliver, 006 architectural-rules tree, 011 capture, 013 session recaps) exists to feed prep or a sibling of it.

## What prep owns

- **Pre-work priming.** Load the architectural rules that apply to the current task into working context before code is written.
- **Scope identification.** Given a task, identify which language(s), domain(s), project, and task type matter.
- **Task-shift observation.** During subsequent work, notice when the current request drifts from the primed scope and ask the user before proceeding.
- **Push-back routing.** When the user corrects Claude with reference to a rule, route that correction through the capture organ rather than acting silently.

## What prep inherits / does not own

| Concern | Source | What prep does | | --- | --- | --- | | Rule storage + tagging | [storage tagging](storage-tagging.md) + [architectural-rules](architectural-rules.md) | Reads; never writes | | Retrieval and scoring | [discover](discover.md) | Consumes as a caller with structured filters | | Body rendering / cap / ordering | [deliver](delivery-organ.md) | Passes `render_bodies: true`; deliver owns the contract | | Rule capture | [capture organ](capture-organ.md) | Proposes capture on push-back; capture owns the flow | | Project architecture file format | [project-architecture](project-architecture.md) | Reads `.claude/architecture.md` directly (not via discover) | | Episodic recall | [session recaps](recap-organ.md) | Explicitly excluded — `include_recaps: false` | | Rule-violation detection | [review](review-organ.md) | Complementary — review audits, prep primes | Prep coordinates. It does not invent retrieval, storage, or presentation.

## Triggers

**Auto-fire** (Claude reads the skill's description and self-fires):

1. First substantive task of a session — code-writing, design, debugging, or review requests. Not trivial questions / lookups.
2. First substantive task after `/clear`.
3. User signals a topic shift ("now let's work on X", "switching to Y").

**Manual fire:**

4. `/prep [scope-hint]` — explicit trigger, optionally with scope hints to bias detection.
5. Natural language: "prep for this", "load architectural rules", "prime for X".

**Does not auto-fire on:** session start before any task exists; trivial information requests; every turn (prep is per-task, not per-turn).

## Flow

```
Trigger fires
 │
 ▼
1. Identify task scope (type, language, domain, project)
 │
 ▼
2. Call discover with kind:"architectural-rule", render_bodies:true, include_recaps:false
 │
 ▼
3. Read.claude/architecture.md if present
 │
 ▼
4. Merge, prioritise (project > domain > language > universal), cap (20 rules / <500 tokens)
 │
 ▼
5. Surface priming block — user sees what was loaded
 │
 ▼
6. Record primed scope (in-context note, ephemeral)
 │
 ▼
7. Observe drift throughout subsequent work — ask before proceeding outside scope
 │
 ▼
8. Route push-back through capture (propose, never silent)
```

See [`skills/prep/SKILL.md`](../skills/prep/SKILL.md) for the procedural detail, including relevance-phase mappings per task type and failure modes.

## Output format

```
Prepped for: <language(s)> / <domain(s)> / project: <name>

Loaded N rules:
 Universal: <terse rule list>
 Language: <terse rule list>
 Domain: <terse rule list>
 Project: <terse rule list>

Codemap age: X days. Architecture file: present | absent.
```

Empty-result shape when nothing matched:

```
Prepped for: <detected scope>
No architectural rules matched.
Either this scope has no captured rules yet, or the task scope was misidentified.
Proceeding without priming. Run /prep manually if you want to provide context.
```

## Task-shift rule

**Mechanism: Claude observes, surfaces, asks. No silent file-shift detection.**

When Claude notices any of:

- The current request mentions a different module / domain / language than the primed scope.
- It is about to read or write files outside paths implied by the primed scope.
- The user's intent has clearly shifted topic (even before files are touched).

…it stops and says: *"This looks like it may be moving outside the original scope (primed for X; now touching Y). Re-prep?"*

User answers. On yes → re-prep. On no → proceed. The primed-scope note updates either way.

**Why "observe and ask" instead of "detect and auto-shift":**

- Reads-then-writes means file-shift detection fires *after* the first file is already written under stale priming.
- State tracking for primed-scope sets must live somewhere — adds machinery for a judgement that the user can make faster.
- False-positive cost is low (user says "keep going"); false-negative cost is low (`/prep` is always available). Asymmetry favours surfacing.

**Budget:** at most one such prompt per 3 file operations in a row. Prevents thrashing across multi-file edits that span modules.

## Push-back handling

When the user references a rule while correcting Claude ("you violated SoC", "imports /api directly — go via services"):

1. Acknowledge the correction; adjust the code.
2. Classify the rule:
 - **Already in the primed set** → Claude missed it. No capture needed; the rule exists.
 - **Captured but not primed** → scope detection missed it. Offer to re-`/prep` with broader scope.
 - **Not captured** → propose a capture via `/capture`. Capture's own flow handles the rest.
3. Never auto-capture. The collaborator principle extends here.

## Caps

- **20 rules** per priming pass. Drop from lowest-specificity tier first (universal → language → domain; project-specific rules are never dropped within the cap).
- **<500 tokens** target for the priming block. If rule bodies are too long, the issue is upstream — compression belongs at storage time, not at prep time.
- **1 drift prompt per 3 file operations.** Thrashing prevention.

## Per-concern specialists (parked for v2)

An alternative architecture: instead of one generalist prep skill that loads rules per task, ship specialist subagents per concern — a C++ agent, a C# agent, a UI agent — each pre-loaded with its own discipline. Prep routes the task to the relevant specialist(s).

Pros: lighter per-task context, more reliable (the specialist *is* the discipline, not "Claude reading rules then trying to apply them"), composable for cross-cutting tasks.

Cons: subagents are heavier than skills; multiplying them risks fragmentation; the composition pattern is unproven here.

**Verdict: park for v2.** Revisit when v1's rule-loading approach reveals its limits. Details in §"Per-concern specialist agents".

## Debug

- Prep didn't auto-fire on a code-writing task. Two likely causes: (a) the task description didn't read as substantive (too short / too vague / phrased as a question); (b) the skill matcher didn't pick up the description. Invoke `/prep` manually and, if this recurs, file a 004 amendment.
- Priming block is empty but architectural-rules tree has rules. Likely scope detection fell back to `[global]` only and none of those rules are tagged for the task type. Surface the scope in the priming block output and re-run with an explicit hint: `/prep <language> <domain>`.
- Drift prompt fires too often. Budget is 1-per-3 file operations — if hitting more, the primed scope is probably too narrow. Re-prep with broader scope, or propose a budget adjustment.
- Drift prompt never fires despite visible scope changes. Claude's own judgement failed — use `/prep` manually to re-prime. Flag if systemic.
- Push-back → capture proposal isn't appearing when it should. Likely Claude attributed the correction to an already-primed rule. Confirm by asking Claude *"Is this a new rule, or did I miss one?"*.
