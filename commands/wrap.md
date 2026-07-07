---
description: Session-terminus driver — one /wrap runs the whole closing ceremony in order (coordinate teardown → checkpoint if warranted → recap → close-out → changelog → BACKLOG-shipped-row sweep → build_progress), driving the existing organs rather than reimplementing them. Auto-runs the reversible spine; every canonical write passes accept/edit/reject.
---

Run the `wrap` skill.

`/wrap` sequences the session-closing ceremony in one pass, driving the existing organs (it does not reimplement them):

- `/wrap` — run the full ceremony: coordinate teardown → checkpoint (if a module/corpus change was built) → recap (with §7.4 doorways suppressed — /wrap owns them) → close-out (if a slug shipped) → update-changelog (if a non-slug ship and close-out didn't run) → BACKLOG-shipped-row sweep → build_progress offer. Each step is conditional and skipped silently when it doesn't apply.

It reads the autonomy contract **once** to set the interrupt posture (`forks-only` runs the reversible spine uninterrupted; `every-step` confirms each step). The reversible read/draft/detect spine auto-runs; **every canonical write** (recap file, capture, spec reconcile, artefact move, changelog line, BACKLOG-row removal, build_progress edit) passes its own accept/edit/reject gate. When close-out runs, the changelog step is suppressed (close-out contains the changelog write — no double-offer).

The manual `/wrap` **never auto-fires**. An optional `SessionStart`-recovery hook (`enabled:false` by default) can *propose* `/wrap` at the next session start when the prior session shipped work whose terminus was never run.

See `~/.claude/skills/wrap/SKILL.md` for the full procedure.
