---
description: Close out the scope chain on a shipped slug — reconcile shipped reality into the canonical spec, retire spent plan/blueprint artefacts to a dated archive folder, record one ship line. The terminus after /execute meets done-criteria.
---

Run the `close-out` skill for the given slug.

The text after `/close-out` is the slug to close out. Examples:

- `/close-out auth-rework` — reconcile the shipped `auth-rework` change into its spec (a new `as-shipped` version, intent preserved), retire its plan + blueprint to `.claude/archive/<date>-auth-rework/`, and log one ship line to `CHANGELOG.md`.
- `/close-out` (no slug) — the skill asks which slug (it requires one).

The skill confirms the change actually shipped (done-criteria met), then runs **reconcile → retire → record**: it diffs spec-vs-shipped and proposes the reconciled spec version behind accept/edit/reject, previews the artefact moves before performing them, and invokes `update-changelog` for the single ship line. It **never auto-writes** — every spec edit and file move passes a propose-confirm gate. Mode A, never auto-fires.

See `~/.claude/skills/close-out/SKILL.md` for the full procedure.
