# Storage tagging — memory frontmatter and folders

Implements. Companion to the authoritative instructions in [`claude-md/memory-capture.md`](../claude-md/memory-capture.md) — this doc is the Claude-facing reference, that fragment is what Claude actually reads at runtime.

## Frontmatter schema

| Field | Required | Values | Notes | | --- | --- | --- | --- | | `name` | yes | short name | existing field | | `description` | yes | one-line | existing field, should be specific enough for discovery to judge relevance | | `type` | yes | `user` \| `feedback` \| `project` \| `reference` \| `session-recap` | existing field; `session-recap` added in | | `kind` | no | `architectural-rule` \| `decision` \| `lesson` \| `preference` | default `lesson`, omit when default | | `scope` | yes | list of tags, e.g. `[auth, billing]` or `[global]` | freeform, short, lowercase-hyphenated, `[global]` = always potentially relevant | | `relevance` | yes | `always` \| `when-touching-X` \| `during-planning` \| `during-review` \| `during-debug` | multiple allowed comma-separated, e.g. `when-touching-auth, during-review` | No controlled vocabulary for `scope`. Tags emerge from usage. Discovery surfaces inconsistencies over time.

## Folder layout

Under each project's memory root (`~/.claude/projects/<slug>/memory/`):

```
memory/
├── MEMORY.md
├── feedback/ (type: feedback)
├── project/ (type: project)
├── sessions/ (type: session-recap; YYYY-MM-DD-<slug>.md)
├── architectural-rules/
│ ├── universal/ (scope = universal)
│ ├── cpp/ (scope = cpp)
│ └──... (one folder per language/domain scope)
├── decisions/ (kind: decision)
├── lessons/ (kind: lesson — default)
└── preferences/ (kind: preference)
```

One level of nesting everywhere except `architectural-rules/`, which gets a second level keyed on scope. Folders are created lazily when the first memory of that kind arrives. `feedback/`, `project/`, and `sessions/` are keyed on `type`; the rest are keyed on `kind`. Recaps live in `sessions/` and are discovered by folder scan, not via `MEMORY.md`.

## Kind semantics

- **`architectural-rule`** — SOLID/SoC, language idioms (RAII, public-surface conventions), domain patterns (rendering = strategy), project-specific architecture forbids. Consumed by prep and review.
- **`decision`** — a choice made with explicit reasoning. Consumed by discovery for context.
- **`lesson`** — something learned in practice. Default when `kind` is omitted.
- **`preference`** — user-style preferences (verbosity, format, communication style).

## Scope semantics

- Flat list of tags.
- `[global]` means always potentially relevant — use when nothing more specific fits.
- Multiple scopes OK: `[auth, billing]` means relevant for either.
- Stay short, lowercase, hyphenated. No master list enforced.

## Relevance semantics

- Describes *when in the workflow* the memory matters.
- `always` — load-bearing rule.
- `when-touching-X` — applies when working in scope `X`.
- `during-planning` / `during-review` / `during-debug` — applies to a work phase.
- Combinations allowed: `when-touching-auth, during-review`.

## MEMORY.md index

Unchanged. One line per entry, under ~150 chars. Path includes subfolder once the file is moved.

```
- [Short title](path/including/subfolder.md) — terse one-line hook
```

## Migration

**Lazy-on-touch.** No big-bang migration. Existing flat memory files keep working — discovery treats missing fields permissively. When a file is edited for any reason, bring its frontmatter up to the new schema and relocate it to the matching sub-folder in the same edit. Update the MEMORY.md index line in the same step.

## Install — one-time per machine

Bootstrap links `claude-md/` into `~/.claude/claude-md/` automatically. The `@import` line must be added to `~/.claude/CLAUDE.md` manually:

1. Open `~/.claude/CLAUDE.md`.
2. Add:
 ```
 @claude-md/memory-capture.md
 ```
3. Save. Effective next session.

Bootstrap does not auto-append because `~/.claude/CLAUDE.md` is user-owned content. See [`claude-md/_imports.md`](../claude-md/_imports.md) for the canonical import list.

## Debug

- Fragment not loading: try path variants documented in `_imports.md`. Confirm the fragment is visible at `~/.claude/claude-md/memory-capture.md` (symlink or copy).
- New memories still missing `scope`/`relevance`: confirm `@import` line is in `~/.claude/CLAUDE.md` and that Claude has been restarted since adding it.
- Old memories without fields: expected. Lazy migration. They update when next edited.
