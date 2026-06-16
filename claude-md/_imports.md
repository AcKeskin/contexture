# claude-md import index

Fragments in this folder are designed to be pulled into `~/.claude/CLAUDE.md` via `@import`. Bootstrap links this folder to `~/.claude/claude-md/` but does **not** edit `~/.claude/CLAUDE.md` — too easy to clobber user content. Each fragment is added once, manually, on each machine.

## Active fragments

*(none currently imported always-on)*

## On-demand fragments (linked, NOT imported)

| Fragment | Purpose | Consumer | | --- | --- | --- | | `memory-capture.md` | Frontmatter template, folder layout, and capture rules for memory files. Implements. | `capture` skill `Read`s it on demand. **Deliberately removed from always-on** (saved ~2.3K tokens/session) — it is capture-time guidance, needed only when writing a memory. Do not re-add `@claude-md/memory-capture.md` to `~/.claude/CLAUDE.md` without revisiting that token trade-off. | ## How to add an import

1. Open `~/.claude/CLAUDE.md`.
2. Paste the import line under a heading like `## Imports` (create it if absent).
3. Save. The next session will include the fragment.

## Linked trees (no `@import` required)

Some subtrees are linked into `~/.claude/` but not imported into `CLAUDE.md` — they are consumed at runtime by discovery / prep / review, not via Claude's startup context load.

| Tree | Linked to | Consumer | Reference | | --- | --- | --- | --- | | `architectural-rules/` | `~/.claude/architectural-rules/` | Discovery, prep, review | [`docs/architectural-rules.md`](../docs/architectural-rules.md) | No user action required beyond running bootstrap.

## Notes

- `@import` path form assumed: relative to `~/.claude/`. Verify on first use — if Claude does not load the fragment, try the full path `@.claude/claude-md/memory-capture.md` or `@~/.claude/claude-md/memory-capture.md` until one resolves, and update this file.
- Removing a fragment: delete the `@import` line. The file stays linked but inert.
