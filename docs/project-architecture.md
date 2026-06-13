# Project architecture — `.claude/architecture.md`

When a project has architectural rules that don't generalize beyond that codebase, and there are enough of them to warrant explicit documentation, the rules live in `<project-root>/.claude/architecture.md`.

This is Option B in. Option A — per-project tagged memory — is the alternative for smaller rule sets.

## When to use which

| Rule set size | Home | Reason | | --- | --- | --- | | < ~10 project-specific rules | Per-project memory, `scope: [project-<name>]` | Cheaper; no file to maintain; still queryable via discovery | | Multi-module with clear boundaries, > ~10 rules | `.claude/architecture.md` | Single canonical file for the project. User choice whether to version-control. | | Both | `.claude/architecture.md` canonical + individual rules also tagged into memory | Same pattern as global CLAUDE.md + architectural-rules tree | Rule of thumb: if the rules outlive a single session and new contributors (human or AI) need to understand the project's shape, write the file.

## File location

- Path: `<project-root>/.claude/architecture.md`.
- **Sync is the user's choice**. Default: local-only (most `.gitignore` setups — global or project-level — exclude `.claude/`). To version-control this file with the code, add an explicit `!` rule to the project's `.gitignore`.
- No symlink, no bootstrap wiring — it is native to the project.

## Template

```markdown
# Architecture — <project name>

## Overview
<one paragraph: what this codebase is, what it's not>

## Module map
- `/src/domain/` — pure domain models, framework-agnostic
- `/src/services/` — orchestration, side effects, transport
- `/src/ui/` — presentation only, no business logic
- `/src/api/` — HTTP layer, calls services

## Boundaries (forbidden imports)
- `/src/ui/` → must not import from `/src/api/` (go via `/services`)
- `/src/domain/` → must not import from anything outside `/src/domain/`
- `/src/api/` → must not import from `/src/ui/`

## Patterns in use
- State management: reducer-based (Redux Toolkit)
- API clients: adapter pattern, one adapter per external service
- Rendering: declarative components, no imperative DOM access

## Conventions
- File naming: kebab-case
- Test files: co-located, `.test.ts` suffix
- Public exports only at module index files

## Why these decisions
<short prose: the reasoning, the past mistakes that drove the structure>
```

## Voice

Terse, factual, Claude-facing. Same compression discipline as memory files. One-line bullets where possible. Prose only for the "Why" section, where context is the point.

Not a replacement for a human-facing architecture doc (e.g. `docs/architecture.md` or an ADR folder). Those are for people; this is for Claude at runtime.

## Consumption

- **Discovery** — reads this file when the current working directory matches the project, surfaces it as project context.
- **Prep** — loads this file at the start of a non-trivial task in the project.
- **Review (pending)** — checks diffs against the `Boundaries` and `Patterns in use` sections.

## Maintenance

- Update when module boundaries change, new patterns are adopted, or forbidden imports shift. Same pressure as any architecture doc: it drifts if nobody touches it.
- When the file grows past ~300 lines, split sub-sections into their own files under `.claude/arch/` and link from `architecture.md`. Don't let one file become a dumping ground.
- Individual rules from this file can also be captured as tagged project memories (`scope: [project-<name>]`) when discovery benefits from pulling a single rule in isolation. The file stays canonical.

## Relationship to `~/.claude/architectural-rules/`

The global tree holds rules that apply across projects (universal / language / domain). This file holds rules that only apply here. No overlap by design. A project may extend a domain rule ("we use the adapter pattern for API clients, and specifically we wrap repositories at the service boundary") — the universal shape lives in `~/.claude/architectural-rules/<domain>/`, the project-specific extension lives in `.claude/architecture.md`.
