---
name: new-agent
description: Scaffold a new Claude Code subagent under agents/ — interview-driven, forces the user to articulate job-to-be-done, pre-flight questions, anti-patterns, and a debugging workflow rather than a generic persona. Use when the user types /new-agent or asks to create / scaffold / add a subagent. Mode A only — never auto-fire.
---

# new-agent

The subagent scaffold organ. Closes the gap that the existing `*-pro.md` files in `agents/` are persona stubs — concise but topic-list shaped, easy to copy thinly. This skill turns the act of "write a new agent" into an interview that surfaces the operational knowledge a new agent file should carry: the questions the agent must ask before writing code, the landmines it must avoid, and the triage order it follows when output is wrong.

## When to run

- User types `/new-agent` (explicit trigger).
- User says "scaffold a new subagent," "I want a new agent for X," "add a `*-pro` agent."
- Do **not** auto-fire. No session-start or event-hook triggers. Mode A only — every run goes through the full interview.

## Inputs

1. **Triggering message.** Anything after `/new-agent` is hint text — used to pre-fill a *suggested* answer for the relevant interview question, never to skip the question.
2. **Existing agents tree.** `agents/` (in this project root) and `~/.claude/agents/` — used for the collision check on the chosen name and to surface the existing `*-pro.md` files as anchors so the new file matches house style.
3. **No settings.json edit.** Subagents are auto-discovered by Claude Code from `~/.claude/agents/`. The bootstrap symlinks `agents/` → `~/.claude/agents/`. This skill only writes one file.

## Why this skill exists

The existing pattern (`cpp-pro.md`, `c-sharp-pro.md`, etc.) gives you four sections — Focus Areas, Approach, Output, plus a one-line opening — and that is enough for broad-stroke language experts. It is *not* enough for a domain agent (e.g. "video frame source for Metal," "Postgres logical-replication debugging," "Unity URP shader graph"). A domain agent needs:

- The **specific questions it must ask** before writing code, because the wrong default cascades.
- The **landmines** the user already discovered, written down so the agent will not re-discover them.
- The **debugging order** for when its output looks plausible but wrong.

A free-form "describe an agent" prompt produces topic lists. A structured interview produces operational knowledge. This skill is the structured interview.

## Procedure

### 1. Name & slug

Prompt:

```
What should the agent be called? (lowercase-with-dashes, no extension)
Convention: language/runtime experts end in -pro (rust-pro, cpp-pro).
            Domain experts end in -pro or describe the domain (security-reviewer, metal-video-source-pro).
```

Validate: lowercase letters, digits, hyphens only. No leading/trailing hyphen, no double hyphens. Reject otherwise with the rule restated.

Collision check immediately: if `agents/<name>.md` already exists, offer:

```
Agent '<name>' already exists at agents/<name>.md.
  (o)verwrite — replace the file
  (r)ename    — pick a new name
  (a)bort     — exit without changes
Choice?
```

### 2. Job-to-be-done (one sentence)

Prompt:

```
In one sentence, what specific class of tasks is this agent for?
Bad:  "Writing good Rust code." (a generic coder does that)
Good: "Auditing Rust async runtimes for Send/Sync violations and pinning bugs." (specific, narrow, testable)
```

Reject answers that:
- Are longer than two sentences (forces compression).
- Use the words "general," "best practices," "high-quality," "modern," "idiomatic" without a specific qualifier.
- Don't name an artifact, decision, or judgment the agent is supposed to produce.

If the answer is too generic, restate the bad/good examples and ask again. Two soft rejections, then accept whatever the user gives — do not block forever.

### 3. Scope — language / platform / framework

Three sub-prompts in order. Use AskUserQuestion when the choice space is enumerable (languages, OS targets); use plain text when it is open-ended (frameworks, libraries).

```
Q1. Primary language(s)? (e.g. Swift, Objective-C, Rust, TypeScript)
Q2. Platform / runtime target? (e.g. iOS+macOS, Linux server, browser, Unity, .NET 8)
Q3. Specific framework / library / subsystem this agent specializes in?
    (e.g. AVFoundation+Metal, Tokio, React 19+, Entity Framework Core)
```

Capture all three verbatim. They become the opening paragraph and feed the description's PROACTIVELY clause.

### 4. Tool allowlist & model

Prompt:

```
Which tools should this agent have access to?
Defaults for a coding agent: Read, Write, Edit, Bash
Defaults for a review/audit agent: Read, Grep, Edit
Defaults for an investigator: All tools except Agent, ExitPlanMode, Edit, Write, NotebookEdit
Choice? (comma-separated, or 'coding'/'review'/'investigator' for a default)
```

Then:

```
Which model? (sonnet / opus / haiku — default sonnet)
Use opus for high-stakes reasoning agents. Use haiku for high-volume cheap-pass agents.
```

### 5. Pre-flight questions (3–5)

This is the heart of the interview. Prompt:

```
What questions MUST this agent ask the user before writing code?
List 3–5. Each should be one the agent will need the answer to in order to avoid producing
plausible-looking output that fails on real input.

Example for a Postgres-debugging agent:
  1. Which Postgres version, and is it managed (RDS/Cloud SQL) or self-hosted?
  2. What's the workload — OLTP, OLAP, mixed? Average row size? Indexed?
  3. What's the failure mode — slow query, lock contention, replication lag, OOM?
  4. Read replica involved? Streaming or logical replication?

Now yours (one per line, blank line to finish):
```

Collect lines until blank. Reject the set if:
- Fewer than 3 questions.
- Any question is yes/no without a follow-up branch.
- Any question is generic ("what are you trying to do?", "what's the requirement?").

If rejected, restate the example and ask again. Two soft rejections, then accept.

### 6. Anti-patterns (3–5)

Prompt:

```
What are 3–5 specific landmines this agent must refuse to emit?
These are the "I've been burned by this exact thing" entries — narrow, concrete, with the
symptom the user will see if it slips through.

Example for a Metal video agent:
  - CVPixelBufferLockBaseAddress + memcpy into a fresh MTLBuffer.
    Symptom: CPU pegged, GPU starved.
  - Hardcoding 32BGRA on a 10-bit HDR source.
    Symptom: HDR clipped to SDR.

Now yours (one per line; format "rule. Symptom: ...". Blank line to finish):
```

Reject if:
- Fewer than 3 entries.
- Any entry lacks a "Symptom:" clause (the symptom is what makes it real).
- Any entry is a generic best-practice violation rather than a specific trap.

### 7. Debugging workflow (triage order)

Prompt:

```
When this agent's output looks plausible but is wrong, what's the triage order?
List 3–7 steps, cheapest checks first. Each step should rule out a class of causes.

Example for a Metal video agent:
  1. Is anything reaching the screen at all? (GPU frame capture)
  2. Is the layout wrong, or are the colors wrong? (different root causes)
  3. Sample one pixel and compare against expected values.
  4. Print CVImageBuffer attachments (matrix, transfer, primaries).

Now yours (one per line, blank line to finish):
```

Reject if fewer than 3 steps or any step is "check the logs" / "read the docs" without a specific signal to look for.

### 8. Output contract

Prompt:

```
What artefacts does this agent produce? Be specific about file types, build flags,
test framework, and any required scaffolding.

Example for a Metal video agent:
  - Swift and/or Objective-C files with a Decoder / FramePool / MetalBridge / Renderer split.
  - XCTest scaffolding with golden-frame readback.
  - os_signpost intervals around decode→wrap→encode.
  - Build flags: -fobjc-arc, MTL_ENABLE_DEBUG_INFO=INCLUDE_SOURCE.

Now yours (one bullet per line, blank line to finish):
```

No structural rejection — accept whatever the user provides. The discipline already came from steps 5–7.

### 9. Trigger conditions (description's PROACTIVELY clause)

Prompt:

```
When should the user see this agent invoked PROACTIVELY?
List 2–4 specific situations. These become the "Use PROACTIVELY for ..." sentence in the description.

Example for a Metal video agent:
  - VTDecompressionSession pipelines
  - CVPixelBuffer→MTLTexture wrapping
  - HDR10/HLG/Dolby Vision decode
  - Camera/decoder→Metal interop in Swift or Objective-C

Now yours (one per line, blank line to finish):
```

Optional follow-up:

```
Any explicit NEGATIVE triggers — situations where this agent should NOT be invoked
even if it looks relevant? (blank line to skip)
```

### 10. Compose & preview

Build the agent file with this layout (sections in order):

```
---
name: <name>
description: <opening sentence about scope> Use PROACTIVELY for <triggers>.
tools: <tool list>
model: <model>
---

You are a <role> specializing in <scope sentence — language, platform, framework>.
<Optional second sentence on what makes the output good.>

## Focus Areas

<Bulleted list. Pull from the scope answers + a few derived items based on the framework.
If the user did not list these, prompt: "Anything specific to focus on beyond <derived list>? (blank to skip)">

## Pre-flight questions

Always ask these before generating code. Skipping any of them produces plausible-looking output that breaks on real input.

<Numbered list from step 5, each with a short why-this-matters clause if the user did not provide one — prompt for it inline if missing.>

## Approach

<Numbered list — derived from the focus areas + pre-flight + anti-patterns. Skill auto-drafts;
user reviews in the preview step.>

## Anti-patterns

<Bulleted list from step 6, with the "Symptom:" clause preserved.>

## Debugging workflow

<Numbered list from step 7.>

## Output

<Bulleted list from step 8.>

<Optional closing line: a one-sentence rule the agent should never violate. Prompt:
"One-line rule the agent should never violate? (blank to skip — e.g. 'Never silently downgrade 10-bit HDR to 8-bit SDR.')">
```

Show the full composed file as a preview:

```
About to write:
  agents/<name>.md  (~<N> lines)

Preview:
<full file content>

Proceed? (y/N)
```

On `n` → ask which section to revise; loop back to that step. On `y` → step 11.

### 11. Write & report

Write `agents/<name>.md`. Then:

```
✓ <name> scaffolded.
  File:     agents/<name>.md
  Symlink:  ~/.claude/agents/<name>.md (via bootstrap — already live if previously bootstrapped)
  Activate: appears as Agent subagent_type='<name>' in next session.

Suggested next steps:
  - Add an entry to README.md under the agents list.
  - Test by invoking: Agent({ subagent_type: '<name>', description: '...', prompt: '...' })
```

Stop. Do not commit. Do not invoke `/review`. The agent file will go into the next user-confirmed commit.

## What this skill does NOT do

- **Does not edit existing agents.** Use `Edit` directly. Editing an agent does not need an interview — only creating one does.
- **Does not modify settings.json.** Subagents do not register there.
- **Does not auto-fire.** Mode A only.
- **Does not write multiple files.** One `.md` per agent. No companion templates, no test fixtures — agents are loaded as plain prompts.
- **Does not enforce a minimum quality bar beyond the soft rejections in steps 2/5/6/7.** The rejection prompts re-show the example and re-ask once. After two re-asks, accept whatever the user gives — the skill is a forcing function, not a gatekeeper.
- **Does not generate the agent's *content* by inference.** Every operational detail comes from the user. The skill structures and composes; it does not invent pre-flight questions or anti-patterns the user did not name.

## Relationship to other organs

- **prep (004)** — when designing a new agent file, prep with `[skills, agents]` scope to load house-style and naming conventions.
- **capture (011)** — surprises during the interview ("the user keeps producing generic answers for step 5") are capture candidates — they hint that the example needs to be sharper.
- **review (005)** — review can catch agent files that have drifted from this template (missing pre-flight, no anti-patterns, generic job-to-be-done).
- **architectural-rules tree (006)** — `universal/skill-auto-fire.md` applies: this skill fires via description on `/new-agent`, no SessionStart hook involved.

## Anchors — existing house style

The five seed agents are the visual reference for length, density, and tone:

- `agents/cpp-pro.md` — broad language expert, persona stub.
- `agents/c-sharp-pro.md` — language + ecosystem expert.
- `agents/rust-pro.md` — language expert with strong opinions.
- `agents/react-pro.md` — framework + version expert.
- `agents/security-reviewer.md` — domain auditor, different tool allowlist (no Bash).

For domain agents (deeper than a single language), the bar is higher — the new sections in this skill (pre-flight, anti-patterns, debugging) carry the operational knowledge that a persona stub cannot.
