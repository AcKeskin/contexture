# Architectural rules

Enumerable, queryable rules about how code should be written. Design history lives in the private companion repo; see [docs/architectural-rules.md](../docs/architectural-rules.md) for the public reference.

## How this tree is used

Bootstrap links this directory into `~/.claude/architectural-rules/`. Discovery, prep, and review read files from this location at runtime.

Unlike `claude-md/`, no `@import` line is needed in `~/.claude/CLAUDE.md` — the tree is consumed by organs, not by Claude's startup context load.

## Layout

```
architectural-rules/
├── universal/ scope: [universal], relevance: always (most) — a few are phase-gated (naming-and-comments.md: during-review; test-quality.md: during-review + when-writing-tests)
├── config-authoring/ scope: [config-authoring], relevance: when-touching-{skills,agents,rules,hooks}
│ # language scopes — gate on the language of the file in scope
├── bash/ scope: [bash], relevance: when-language-bash
├── cpp/ scope: [cpp], relevance: when-language-cpp
├── csharp/ scope: [csharp], relevance: when-language-csharp
├── python/ scope: [python], relevance: when-language-python
├── rust/ scope: [rust], relevance: when-language-rust
├── sql/ scope: [sql], relevance: when-language-sql
├── typescript/ scope: [typescript], relevance: when-language-typescript
├── web/ scope: [web], relevance: when-language-web
│ # engine scopes — gate on the engine the project targets
├── unity/ scope: [unity], relevance: when-domain-unity
├── godot/ scope: [godot], relevance: when-engine-godot
│ # platform scopes — gate on the OS/platform the build targets
├── android/ scope: [android], relevance: when-platform-android
├── linux/ scope: [linux], relevance: when-platform-linux
│ # domain scopes — gate on the problem domain the task touches
├── openxr/ scope: [openxr], relevance: when-domain-openxr
├── rendering/ scope: [rendering], relevance: when-domain-rendering
├── webrtc/ scope: [webrtc], relevance: when-domain-webrtc
└── codecs/ scope: [codecs], relevance: when-domain-codecs
```

New languages / domains: create a new sub-folder. Do not nest further.

**Relevance gate verbs.** A scope's `relevance` tag declares *what kind of fact* makes it fire — four verbs, one family:

| Verb | Fires when | Examples | |---|---|---| | `when-language-<x>` | a file of that language is in scope | cpp, csharp, python, typescript, web, sql, bash | | `when-engine-<x>` | the project targets that engine | unity (`when-domain-unity`, historical), godot | | `when-platform-<x>` | the build targets that OS/platform | android, linux | | `when-domain-<x>` | the task touches that problem domain | openxr, rendering, webrtc, codecs | These are orthogonal and compose: an OpenXR app built for Android pulls `openxr/` **and** `android/`; a Godot project on Linux pulls `godot/` **and** `linux/`. (`unity/` predates the split and is tagged `when-domain-unity`; left as-is for stability — the engine/platform/domain distinction is what `discover`/`prep` filter on, and an exact-string match still works.)

The four verbs above are the **scope-axis** (what the project *is*). A second **action-axis** family gates on *what the agent is doing* rather than what the project is: `during-<phase>` (`during-planning` / `during-review` / `during-execution` / `during-session` / `during-session-close`), `when-touching-<surface>`, and `when-invoking-tools`. A rule loads at the right *moment* rather than always — e.g. `during-session` fires mid-session once history has accumulated (the session scope-boundary guard's pivot watch), distinct from `during-session-close` at the clear/compact boundary. See [`docs/architectural-rules.md`](../docs/architectural-rules.md) for the full action-axis list.

`typescript/` holds language-level TS idioms (type system, narrowing, modules, async) that hold in any TS context — Node, MCP server, browser. `web/` holds framework-agnostic architectural-layer rules (UI / State / Transport / Domain) that hold for any web framework regardless of language. A rule about `Promise` typing → `typescript/`; a rule about "domain must not import React" → `web/`.

`config-authoring/` is the **meta scope**: rules about *authoring this harness itself* (skills, agents, rules, hooks, settings templates), as opposed to every other scope which governs a *user's* project code. The distinction matters — a user's app code *should* contain their paths and identity; a config-authoring rule must never fire on it. These rules are relevance-gated to the config-authoring surfaces (`when-touching-skills` / `-agents` / `-rules` / `-hooks`), never `relevance: always`. First inhabitant: `share-readiness` (no owner identity/machine assumptions in shipped artefacts).

## File format

Each file is a tagged memory with frontmatter matching [`claude-md/memory-capture.md`](../claude-md/memory-capture.md), fixed values for this tree:

```yaml
---
name: <short>
description: <one-line>
type: user
kind: architectural-rule
scope: [<cluster-tag>, <universal | cpp | csharp | rust | unity | godot | openxr | rendering |...>]
relevance: <always | when-language-X | when-engine-X | when-platform-X | when-domain-X>
---
```

Body: rule + why + scope. Compression discipline applies — no ceremony, no restating obvious context.

## Relationship to `~/.claude/CLAUDE.md`

CLAUDE.md holds meta-guidance about *how Claude operates* — enforcement posture, principles framing, pointers. This tree holds the *enumerable rules* that guidance refers to. CLAUDE.md stays short and human-readable; the tree grows as patterns emerge.

## Overlay tiers

This tree is the **shipped tier** — synced and symlinked, so hand-edits here get clobbered by the next `git pull` + bootstrap. User, company, and project rules live in update-safe sibling tiers that compose on top of this one (precedence highest-first: project > user-local > company > shipped). Manage them with `/rules`; the model is in [`docs/architectural-rules-overlay.md`](../docs/architectural-rules-overlay.md).

## Companion docs

- [`docs/architectural-rules.md`](../docs/architectural-rules.md) — Claude-facing reference for the scopes and how they are consumed.
- [`docs/architectural-rules-overlay.md`](../docs/architectural-rules-overlay.md) — the four-tier overlay: resolution algorithm, override granularities, disable scopes, locked rules.
- [`docs/project-architecture.md`](../docs/project-architecture.md) — when and how to write a project's `.claude/architecture.md`.
