# Memory capture discipline

Instructions for how to write memory files. Imported into `~/.claude/CLAUDE.md`. Applies every session.

## Frontmatter template

Every new memory file uses this shape:

```yaml
---
name: {{short name}}
description: {{one-line — specific enough for discovery to judge relevance}}
type: {{user | feedback | project | reference | session-recap}}
kind: {{optional — architectural-rule | decision | lesson | preference | warning. Default "lesson".}}
scope: {{domain/module tags — e.g. [auth, billing] or [global]. "global" = always potentially relevant.}}
relevance: {{when this matters — "always" | "when-touching-X" | "during-planning" | "during-review" | "during-debug". Multiple allowed, comma-separated.}}
relations:                            # optional — omit when no cross-memory references
  - type: {{supersedes | contradicts | supports | related_to}}
    target: {{relative path from memory root, e.g. lessons/old_thing.md}}
    note: {{optional — context that doesn't fit the type alone}}
---
```

- `scope` and `relevance` are **mandatory** for every new memory. No exceptions. Unclear scope defaults to `[global]` and gets refined later when discovery surfaces it as too broad.
- `kind` is optional. Omit for ordinary lessons (the default). Populate for architectural-rule / decision / preference / warning.
- `relations` is optional. Omit when there are no cross-memory references. See "Typed relations" section below.
- Compression discipline from earlier still applies: rule + why + scope, drop ceremony.

## Kinds — when to pick which

| `kind` | Use for | How it differs from neighbors |
| --- | --- | --- |
| `lesson` (default) | Generalizable insight from experience. "When X happens, do Y because Z." | Insight; principle-shaped. |
| `decision` | An explicit choice with stated reasoning. "We picked A over B because C." | Records a settled trade-off. |
| `architectural-rule` | A discipline rule — SOLID-adjacent, language idiom, project invariant. | Positive principle, prescriptive. |
| `preference` | User-style preference (verbosity, format, communication). | About *how to communicate*, not what to do. |
| `warning` | "This specific thing burned us; do not repeat." Sharp, narrow, references a real prior incident. | Negative landmine — earns its place by citing what went wrong before. |

The `warning` distinction matters: `lesson` is a generalizable insight; `warning` is a specific landmine. They look similar but discovery treats them differently — warnings get surfaced first and visually highlighted because the cost of forgetting one is concrete.

## Typed relations

Memory entries can reference each other via the `relations:` frontmatter field. Four types:

- **`supersedes`** — this memory replaces the target. The target stays readable but is flagged as historical. Bidirectional: when you write `supersedes: target.md`, also add `superseded_by: this-file.md` to the target in the same edit. Discovery hides superseded memories from the normal pool unless queried by name.
- **`contradicts`** — this memory disagrees with the target. Both stand until reconciled. Discovery surfaces both when relevant, with the contradiction flagged so the user can resolve. The `note:` field is strongly recommended here — capturing *why* they disagree is what lets future-you reconcile.
- **`supports`** — this memory reinforces the target with a concrete instance or corroboration. Increases the target's effective weight when both are surfaced.
- **`related_to`** — soft pointer. Two memories live in similar territory; pulling one should hint that the other exists. Single-hop only — discovery does not follow `related_to` chains transitively.

`relations:` is optional. Most memories have none and stay unchanged. Use it when:
- You're capturing something that obsoletes an existing memory (`supersedes` — capture skill prompts for this).
- You're capturing something that disagrees with an existing memory (`contradicts`).
- Two memories are siblings in territory and the connection is non-obvious from titles alone (`related_to`).

Discovery's behavior on relations:
- Loads single-hop targets when the source is surfaced (one level of expansion, no transitive walks).
- Suppresses memories with `superseded_by:` set unless they are queried by name.
- Surfaces `contradicts` pairs together with the conflict flagged.
- Treats `supports` as a weight bonus when both ends are already candidates; does not pull in the target on its own.

## Folder layout

Memory lives under `~/.claude/projects/<slug>/memory/`. One level of sub-folders, keyed off `kind`:

```
memory/
├── MEMORY.md                          (index — unchanged, one line per entry)
├── feedback/                          (type: feedback — user-given rules)
├── project/                           (type: project — facts about ongoing work / state)
├── sessions/                          (type: session-recap — episodic per-session recaps)
├── architectural-rules/               (kind: architectural-rule)
│   ├── universal/                     (second level = scope, only here)
│   ├── cpp/
│   ├── csharp/
│   └── ...
├── decisions/                         (kind: decision)
├── lessons/                           (kind: lesson — default)
└── preferences/                       (kind: preference)
```

Rules:
- Folder name aligns with `type` for feedback, project, and session-recap; with `kind` for the others.
- `feedback/`, `project/`, `sessions/` are folders keyed on `type`, not `kind`. Historical convention; keep it.
- Only `architectural-rules/` gets a second level of nesting (one folder per scope: language or domain). Every other folder stays flat.
- `sessions/` files follow the `YYYY-MM-DD-<slug>.md` convention; they are discovered by folder scan, not via `MEMORY.md`.
- Create folders lazily — do not pre-create empty ones.

## MEMORY.md index

One line per entry, under ~150 chars, hook-style description.

```
- [Short title](path/including/subfolder.md) — terse one-line hook
```

When a file moves into a sub-folder, update the path in the index in the same edit.

### Budget scoreboard (header)

MEMORY.md opens with a live scoreboard line — it is injected every session, so it makes corpus regrowth impossible to not-notice (the permanent self-monitoring guard). Format:

```
<!-- BUDGET: memories=<N> always-on=<A> always-bytes=<B> last-audit=<YYYY-MM-DD> -->
```

- `memories` — total memory files (excluding MEMORY.md and `sessions/`).
- `always-on` — count of `relevance: always` files (the per-session floor).
- `always-bytes` — total bytes of those always-on files.
- `last-audit` — date `/memory-audit` last ran.

Capture updates `memories` (and `always-on` / `always-bytes` if the new entry is `relevance: always`) in the same write that appends the index line. `/memory-audit` updates `last-audit`. Soft ceilings: **always-on ≤ ~20 files / ~60 KB**; crossing either is a `/memory-audit` dim-10 trigger. The scoreboard is the cheap signal that the source-level guards (capture §6b) are holding.

## Capture rules

1. Every new memory gets `scope` and `relevance` populated. No exceptions.
2. `kind` populated when it is not the default (`lesson`).
3. Unclear scope → `[global]`, refine later.
4. Rule + why + scope, in the **model-optimized compressed form** — memory bodies are read by models, not humans. Hybrid by field: `description` + MEMORY.md hook stay human-legible (discovery signal); the body goes terse shorthand. Keep the why **iff** dropping it would let a future model misapply the rule (the misapplication test); drop it when the rule self-enforces. Full rules + worked example: `contexture/docs/memory-compression-spec.md`.
5. Write the memory file to its sub-folder. Add the matching MEMORY.md index line in the same step.

## Lazy migration

Existing memory files without `scope` / `relevance` / `kind` / `relations`:

- **When reading only:** do not rewrite. Treat missing fields as permissive (`scope: [global]`, `relevance: always`, `kind: lesson`, no relations) for matching purposes.
- **When editing the file for any other reason:** bring it up to the new template in the same edit. Move it into the matching sub-folder and update the MEMORY.md path. If the kind is conceptually wrong (e.g. tagged `lesson` but is actually a `warning` per the table above), retag in the same edit.

No big-bang migration. Drift corrects with use.

The `relations:` field is purely additive — existing memories without it work fine. Add `relations:` entries only when capturing or editing reveals a real cross-memory link worth recording.

## When not to capture

The rules above are about *how* to capture when capture is warranted. Whether to capture at all is governed elsewhere:
- User explicitly asks → capture (confirm first if the content is non-obvious).
- User correction / discipline violation surfaces → offer to capture the lesson.
- Noteworthy episodic lesson mid-task → propose capture before moving on.
- Do **not** auto-capture silently. Collaborator-not-auto-learner principle.
