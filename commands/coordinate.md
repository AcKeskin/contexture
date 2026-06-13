---
description: Keep multiple live Claude sessions aligned via a shared, gitignored session board (.claude/sessions-active.md) — register what this session owns, see what others own, leave hand-off notes, detect file/slug collisions. A session can claim coordinator to assign work to others. No daemon/polling.
---

Run the `coordinate` skill.

Forms:

- `/coordinate` or `/coordinate register` — register/update this session on the board (what slug + files it owns, status), with a collision check against the others.
- `/coordinate check` — read the board: what others own, any hand-offs/assignments for this session, any collisions or stale orphan rows.
- `/coordinate handoff <session> <note>` — leave a note for another session ("ui: I changed the token contract — re-read before wiring").
- `/coordinate coordinator` — claim (or release) the coordinator role, which can write assignments other sessions pick up on their next check.
- `/coordinate done` — tear down this session's row on close.

The shared memory that **peer** sessions coordinate through when you fragment work across multiple live windows (a `/execute` per work-stream). It is **not** `/orchestrate` (which dispatches subagents within one session). No daemon, no polling — read at start + key moments, write on change. The board is **gitignored ephemeral** state, carries no secrets, and the coordinator can *direct* but not *force* peers. Collisions are surfaced, never auto-resolved; nothing auto-fires.

See `~/.claude/skills/coordinate/SKILL.md` for the full procedure.
