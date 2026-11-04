# update-codemap: reference

Read when the step you are on points here, or when something fails.

## What update-codemap does NOT do

- Does not delete `.claude/codemap.md` when the project is empty (reports an empty codemap and stops).
- Does not modify any file other than `.claude/codemap.md` and `.claude/codemap.dirty` (the latter is cleared after a successful write; `.claude/codemap.config.md` is read-only input).
- Does not render diagrams. Diagrams come from `visualise-codemap`, which consumes this skill's output.
- Does not commit to git. User owns the commit.
- Does not *modify* `.gitignore` (reading it per-directory is core walk behavior). Users choose their sync mode (local-only / git-tracked / external); the skill is indifferent to how the codemap itself is synced.
- Does not cross project boundaries (no traversing into sibling projects, no following symlinks out of the tree).
- Does not generate cross-references between files.

## Limits (v1)

- Pattern-matching, not parsing. Edge cases (template specializations, partial classes, dynamic `export default` expressions) may produce imperfect output. The ambiguity protocol (§5) says: note, do not invent.
- Read cap per file is practical, not semantic. If a real file surfaces where exports live past line 200, the proposal assumption needs revisiting.
- No subagent delegation. If main context strains on a huge repo, that is a signal to revisit — do not silently silence the symptom.
- Per-project config covers Skip / Vendored / Layers / Auto-update. Force-include is a future extension, not v1.
