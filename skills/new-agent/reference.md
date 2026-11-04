# new-agent: reference

Read when the step you are on points here, or when something fails.

## What this skill does NOT do

- **Does not edit existing agents.** Use `Edit` directly. Editing an agent does not need an interview — only creating one does.
- **Does not modify settings.json.** Subagents do not register there.
- **Does not auto-fire.** Mode A only.
- **Does not write multiple files.** One `.md` per agent. No companion templates, no test fixtures — agents are loaded as plain prompts.
- **Does not enforce a minimum quality bar beyond the soft rejections in steps 2/5/6/7.** The rejection prompts re-show the example and re-ask once. After two re-asks, accept whatever the user gives — the skill is a forcing function, not a gatekeeper.
- **Does not generate the agent's *content* by inference.** Every operational detail comes from the user. The skill structures and composes; it does not invent pre-flight questions or anti-patterns the user did not name.
- **Does not delete or retire shipped agents.** The gates (§4b, §9b) are authoring-time prevention only. Retiring an existing dead-config agent is a separate user decision on the public repo — the ongoing deletion-test sweep belongs to `/checkpoint --scope corpus`, not here.

## Relationship to other organs

- **prep** — when designing a new agent file, prep with `[skills, agents]` scope to load house-style and naming conventions.
- **capture** — surprises during the interview ("the user keeps producing generic answers for step 5") are capture candidates — they hint that the example needs to be sharper.
- **review** — review can catch agent files that have drifted from this template (missing pre-flight, no anti-patterns, generic job-to-be-done).
- **architectural-rules tree** — `universal/skill-auto-fire.md` applies: this skill fires via description on `/new-agent`, no SessionStart hook involved.

## Anchors — existing house style

The existing agents (11 in `agents/`) are the visual reference for length, density, and tone. A representative spread:

- `agents/cpp-pro.md` — broad language expert, persona stub.
- `agents/c-sharp-pro.md` — language + ecosystem expert.
- `agents/rust-pro.md` — language expert with strong opinions.
- `agents/react-pro.md` — framework + version expert.
- `agents/security-reviewer.md` — domain auditor, different tool allowlist (no Bash).
- `agents/metal-video-source-pro.md`, `agents/vision-os-pro.md`, `agents/unity-pro.md`, `agents/unity-ui-pro.md`, `agents/mcp-py-pro.md`, `agents/mcp-ts-pro.md` — deeper domain agents that carry the pre-flight / anti-pattern / debugging sections.

For domain agents (deeper than a single language), the bar is higher — the new sections in this skill (pre-flight, anti-patterns, debugging) carry the operational knowledge that a persona stub cannot.

### 9b. Routing-collision check & description lint

The `description` field is the **only** signal the router uses to auto-invoke this agent. Two failures live here, and both are cheapest to catch now — before the file exists — because after it ships, a collision shows up as the agent firing *sometimes* (or the router doing the work inline), which is nearly impossible to debug from the outside. The two checks stay distinct even though on a clean roster they often fire together.

**(a) Routing-collision check.** From the `agents/` + `~/.claude/agents/` trees already read for the §1 name collision (no new file read), surface the descriptions of any sibling whose scope is *adjacent* — mechanical first pass: name or scope-keyword overlap (same language, same platform, same subsystem). Then judge **territorial overlap** against those surfaced siblings with the model: does this new description claim ground a sibling already claims?

- **Overlap confirmed** → require a **negative-boundary clause** in the description before proceeding: `NOT for X — use Y`. The shipped roster models this — `unity-pro` carries *"Not for non-Unity C# (use c-sharp-pro), not for visionOS-on-Unity work (consult vision-os-pro)"*. A description that overlaps a sibling and names no boundary is the #1 documented routing failure; do not write it.
- **No overlap** → proceed.

**(b) Description trigger-phrase lint.** Reject a description whose opening is a **title**, not a **behavioral trigger**:

- ✗ Title-shaped: *"Expert/Elite/Master C++ specialist"*, *"Write idiomatic Rust…"*, *"Masters the .NET ecosystem"* — these route poorly, because the router matches on *when to invoke*, not *what the agent is*.
- ✓ Trigger-shaped: a recognized phrase — `Use when…` / `Use PROACTIVELY when…` / `Use after…` / `Use immediately after…` — naming the situation that should invoke it.

On a title-shaped opening, restate the trigger-shaped example and ask for a rewrite. **One soft re-prompt, then accept** what the author gives — the same "two soft rejections, then accept, never block forever" posture as §2/§5/§6. Cite `architectural-rules/universal/agent-instruction-authoring.md` for the behavioral-trigger and paired-opposites patterns rather than restating them.

### 4b. Earn-its-keep gate

Before the interview goes deep, make the author justify that this file should exist at all. By now the job (§2), scope (§3), and tool+model profile (§4) are known — the four axes that decide whether a subagent earns its context. A subagent is a context firewall with a distinct profile, not a personality; a persona over the same tools+model that the base model already handles is dead config that dilutes routing.

Present the four axes and ask the author to clear them:

```
Does this agent earn a file? Clear as many axes as apply:
  (a) Repeated spawn — will it be invoked repeatedly with the same instructions?
  (b) Distinct profile — does it need a DIFFERENT tool/model profile than the session
      (read-only allowlist, haiku for cheap high-volume, opus for high-stakes, worktree)?
  (c) Knowledge delta — does it carry operational knowledge the base model lacks
      (a subsystem's traps, a protocol's rules), beyond writing the language well?
  (d) Output isolation — does it produce verbose output better kept out of the main thread?
```

Resolve the answer:
- **One or more axes clear** → proceed. Note which axes carry the agent (it feeds the description's specificity later).
- **Every axis fails** → this is a persona over the session's own tools+model with no knowledge delta. Steer the author to **prompting `general-purpose`** instead of authoring a file: *"An agent that shares the default profile and adds no knowledge the base model lacks routes worse than an inline prompt — the router coin-flips between it and the generalist. Prompt `general-purpose` for this instead?"*
- **The author still wants the file after the steer** → require a **one-line written justification** and proceed. This gate is **advisory, not a hard block** — a legitimately-niche agent can share the default tool profile and still earn its keep on knowledge alone (the roster's `metal-video-source-pro` and `vision-os-pro` clear axis (c) without axis (b)). The gate makes the author *argue* for the file; it does not forbid it.

**Language-specialist agents must specifically address axis (c)** — the base model already writes the language, so "writes idiomatic X" is not a knowledge delta. If the only justification is fluency in a mainstream language, that is the dead-config trap; ask what the agent knows that the base model does not.

Cite `architectural-rules/universal/agent-instruction-authoring.md` for the underlying "a subagent is a context firewall, not a persona" framing rather than restating it.
