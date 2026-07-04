# Changelog

File-level changes per public snapshot. Curate freely — this is the human-facing history.

## 2026-07-04 — Session-terminus driver /wrap: one command that sequences the whole closing ceremony (coordinate teardown, checkpoint, recap, close-out, changelog, backlog-shipped-row sweep, build-progress) — it drives the existing organs, auto-runs the reversible steps, and gates every canonical write behind accept/edit/reject. Coordinate gains an opt-in auto mode over its gitignored session board (3-boundary auto-check, surface-and-ask collisions, per-session-row race safety). Both ship with off-by-default SessionStart hooks that only ever propose, never act. Rename the codemap diagram skill to visualise-codemap; bring reference.md, the README lifecycle, and a new wrap-organ doc current with all of it.

_6 added, 26 changed, 1 removed._

### Bootstrap
- changed `bootstrap/lib/enablement.js`

### Commands
- added `commands/wrap.md`
- changed `commands/visualise-codemap.md`

### Docs
- added `docs/wrap-organ.md`
- changed `docs/blueprint-organ.md`
- changed `docs/coordinate-organ.md`
- changed `docs/human-view-organ.md`
- changed `docs/plan-execute-workflow.md`
- changed `docs/reference.md`
- changed `docs/update-codemap.md`

### Hooks
- added `hooks/coordinate-autoregister.js`
- added `hooks/wrap-terminus-recovery.js`
- changed `hooks/codemap-dirty-marker.js`

### Other
- changed `AGENTS.md`
- changed `README.md`
- removed `CHANGELOG.md`

### Settings
- changed `settings/settings.template.json`

### Skills
- added `skills/wrap/SKILL.md`
- added `skills/wrap/backlog-sweep.mjs`
- changed `skills/blueprint/SKILL.md`
- changed `skills/blueprint/mermaid-templates.md`
- changed `skills/close-out/SKILL.md`
- changed `skills/coordinate/SKILL.md`
- changed `skills/glossary/SKILL.md`
- changed `skills/human-view/SKILL.md`
- changed `skills/project-instructions/project-instructions.mjs`
- changed `skills/recap/SKILL.md`
- changed `skills/update-changelog/SKILL.md`
- changed `skills/update-codemap/SKILL.md`
- changed `skills/update-codemap/codemap.mjs`
- changed `skills/update-codemap/test/language-sweep.mjs`
- changed `skills/visualise-codemap/SKILL.md`
- changed `skills/visualise-codemap/visualise-codemap.mjs`
