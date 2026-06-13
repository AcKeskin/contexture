# Architectural rules — scopes, locations, consumption

Implements. Companion to [`claude-md/memory-capture.md`](../claude-md/memory-capture.md) (frontmatter template) and [`docs/storage-tagging.md`](storage-tagging.md) (tag semantics).

## The four scopes

| Scope | Applies when | Examples | Where stored | | --- | --- | --- | --- | | **Universal** | Always | SOLID, SoC, RAII, composition > inheritance, no dead code | `~/.claude/architectural-rules/universal/` | | **Language** | Working in that language | C++ headers minimal, C# `IDisposable`, TS discriminated unions | `~/.claude/architectural-rules/<lang>/` | | **Domain** | Working in that domain | Rendering = strategy, API clients = adapter, Unity = component-based | `~/.claude/architectural-rules/<domain>/` | | **Project** | Inside that project's working directory | "`/ui` must not import `/api`"; "entities live in `/domain`" | Per-project memory (tagged `scope: [project-<name>]`) **or** `.claude/architecture.md` in the project | Universal / language / domain rules are **global** — they sync across PCs via the `architectural-rules/` subtree. Project rules are **local to the project** — either as tagged memory or as a version-controlled `.claude/architecture.md`. See [`project-architecture.md`](project-architecture.md) for when a project warrants its own file.

## File layout

```
~/.claude/architectural-rules/ ← symlink into contexture/architectural-rules/
├── universal/ scope: [universal]
├── config-authoring/ scope: [config-authoring] (meta — governs authoring the harness, not user code)
├── bash/ scope: [bash]
├── cpp/ scope: [cpp]
├── csharp/ scope: [csharp]
├── python/ scope: [python]
├── rust/ scope: [rust]
├── sql/ scope: [sql]
├── typescript/ scope: [typescript]
├── web/ scope: [web]
├── unity/ scope: [unity] (engine — when-domain-unity, historical)
├── godot/ scope: [godot] (engine — when-engine-godot)
├── android/ scope: [android] (platform — when-platform-android)
├── linux/ scope: [linux] (platform — when-platform-linux)
├── openxr/ scope: [openxr] (domain — when-domain-openxr)
├── rendering/ scope: [rendering] (domain — when-domain-rendering)
├── webrtc/ scope: [webrtc] (domain — when-domain-webrtc)
└── codecs/ scope: [codecs] (domain — when-domain-codecs)
```

One sub-folder per scope. Flat within each sub-folder — one file per coherent rule cluster, not one file per rule, not one giant file per language.

New scope: create a new sub-folder. No master list enforced.

`config-authoring/` is the **meta scope** — rules about authoring this harness itself (skills/agents/rules/hooks/settings templates), distinct from every other scope which governs a *user's* project code. A user's app code legitimately contains their own paths and identity, so config-authoring rules are relevance-gated to the authoring surfaces (`when-touching-skills/-agents/-rules/-hooks`) and never `always` — they must not fire on user code. First inhabitant: `share-readiness`.

## Frontmatter

Every file in this tree uses the memory-capture schema with `kind: architectural-rule` fixed:

```yaml
---
name: <short>
description: <one-line — specific enough for discovery to rank relevance>
type: user
kind: architectural-rule
scope: [<cluster-tag>, <universal | bash | cpp | csharp | python | rust | sql | typescript | web | unity | godot | android | linux | openxr | rendering | webrtc | codecs |...>]
relevance: <always | when-language-X | when-engine-X | when-platform-X | when-domain-X>
---
```

- `scope` is a flat list. First tag is typically a topical cluster (`raii`, `naming`, `headers`); last tag is the folder's scope for discovery filter.
- `relevance` is the query gate, with four gate verbs that compose: `always` (universal); `when-language-<lang>` (the file's language); `when-engine-<engine>` (the project's engine, e.g. godot); `when-platform-<os>` (the build target, e.g. android/linux); `when-domain-<domain>` (the problem domain, e.g. openxr/rendering/webrtc/codecs). They are orthogonal — an OpenXR app on Android pulls `openxr/` + `android/`. (`unity/` predates the split and stays `when-domain-unity`.)

## Body

Rule + why + scope. Compression discipline applies (see [`feedback/memory_compression_discipline.md`](memory_compression_discipline.md) in the user's memory tree).

- Rule: one line, imperative.
- Why: one line — the non-obvious reason. Drop if the rule is self-evident.
- Optional: a short example if the rule is visual (layout, naming).

No restating context. No ceremony. Reader is Claude reading at runtime, not a human onboarding.

## Consumption

- **Discovery** — scans this tree as one of its sources. Filters by `relevance` against the detected task scope. Loaded rules inform every subsequent response.
- **Prep** — loads universal + applicable language + applicable domain rules at the start of a non-trivial task.
- **Review (pending)** — will match changed code against rules to flag drift.

No `@import` line is needed in `~/.claude/CLAUDE.md` — discovery and prep read this tree directly, not via the CLAUDE.md context load.

## Relationship to `~/.claude/CLAUDE.md`

CLAUDE.md is the *canonical framing* — enforcement posture, principles-level voice, imports index. This tree is the *enumerable detail*.

- A principle like "single responsibility per class/function" may live both in CLAUDE.md (framing) and in `universal/solid-and-responsibilities.md` (queryable rule).
- Language blocks (C++ Rules, Web Rules, Unity Rules) that used to live in CLAUDE.md migrate *out* into this tree — they are enumerable detail, and leaving them in CLAUDE.md wastes context on sessions that don't touch those languages.
- Meta-guidance ("Enforcement", "Professional standard is non-negotiable") stays in CLAUDE.md — it's how Claude should *operate*, not a rule about code.

## Project-specific rules

Two homes:

- **Per-project memory** — tag `scope: [project-<name>]`, `relevance: always` within the project. Lives in that project's `~/.claude/projects/<slug>/memory/`. Good for small rule sets (< ~10 rules).
- **`.claude/architecture.md`** in the project root — version-controlled, syncs with the code. Good for substantive architectural complexity. See [`project-architecture.md`](project-architecture.md).

Both can co-exist: the file is canonical documentation, individual rules also captured as queryable memories. Same pattern as universal principles living in both CLAUDE.md and the memory tree.

## Capture mechanics

Collaborator principle: Claude proposes, user confirms. Triggers:

- **User correction** — "in this project, services always wrap repositories" → propose capturing as project rule.
- **Recurring theme** — same rule restated across multiple sessions → propose promoting to language or domain tier.
- **Review output** — same violation type in multiple files → propose the rule needs sharper articulation.

Claude writes: *"Capture as a rule? Proposed: [exact text, scope, relevance]"*. User accepts / edits / rejects. On accept → file written, MEMORY.md (when applicable) updated.

Never auto-captured silently. Mode A only; Mode B episodic auto-capture stays parked (see).

## Debug

- Rule not surfacing: confirm `~/.claude/architectural-rules/<scope>/<file>.md` readable through the symlink. Confirm `relevance` matches the task scope.
- Wrong rule surfacing: `relevance` too broad. Tighten (`always` → `when-language-<x>`).
- Missing scope folder: create it — tree is lazy, no master list.
