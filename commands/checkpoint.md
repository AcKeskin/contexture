---
description: Scope-dialed fit-and-intent checkpoint — "does this serve the point + cohere + what did I learn?" at diff / module / corpus zoom. Auto-detects scope (+ --scope override); diff scope composes /code-review + a fit-pass; batches findings and routes them. Absorbs retrospect + system-review (deprecated).
---

Run the `checkpoint` skill.

Forms:

- `/checkpoint` — auto-detect the scope and audit at that zoom.
- `/checkpoint --scope diff` — fit on a change: runs `/code-review` (correctness) **and** a fit-pass ("does this serve the intent and cohere with the whole"), in one report.
- `/checkpoint --scope module` — the post-build checkpoint over the just-built module(s): drift-from-intent, **integration-fit** (do the pieces cohere), continue-or-kill, lessons.
- `/checkpoint --scope corpus` — the history + organ-surface audit (absorbs `retrospect` + `system-review` via `retrospect-core`).

Auto-detect: a diff/PR in play → diff; a just-built / named module → module; no target → corpus; ambiguous → asks once. The resolved scope is shown in the report header so you can correct it.

Findings render as **one batch** (042 output contract); you pick which to apply in a single pass; each routes to `/capture` / `/memory-audit` / a `proposals/` stub / a direct edit. Never fixes in place, never auto-fires.

`retrospect` + `system-review` are **deprecated** (kept and functional) — `/checkpoint --scope corpus` is their successor; they retire once checkpoint is proven.

See `~/.claude/skills/checkpoint/SKILL.md` for the full procedure (scope resolution, the per-scope passes, the batch-then-apply flow).
