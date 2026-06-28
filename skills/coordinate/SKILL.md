---
name: coordinate
description: Keep multiple live Claude sessions aligned via a shared, file-based session board (.claude/sessions-active.md, gitignored) — register what this session owns, see what the others own, leave hand-off notes, and detect file/slug collisions. A session can claim coordinator to assign work to others. No daemon/polling — read at start + key moments, write on change. Use on /coordinate [register|check|handoff|coordinator|done], "what are other sessions doing", "hand off to the other session". Mode A.
---

# coordinate

Multi-session coordination. The pipeline *tells you to fragment* — `/spec` and `/draft-plan` recommend a fresh session per phase — so when you plan several things and spin up multiple live sessions (a `/execute` window per work-stream), they drift: session A doesn't know what B decided. `coordinate` is the **shared memory those live, peer sessions coordinate through.**

It is **not** `orchestrate` (which dispatches fire-and-forget *subagents* within one session and reconverges them). These are independent, user-driven **peer sessions** with no parent — so coordination is a **passive shared board**, read-at-action and written-on-change, no daemon or polling. (Folding this into orchestrate's deferred background-session runtime is a later increment —'s "board now, orchestrate later".)

## The board

`<project-root>/.claude/sessions-active.md` — **gitignored, ephemeral live state** (add `.claude/sessions-active.md` to `.gitignore` if `.claude/` isn't already ignored). One row per active session:

```markdown
# Active sessions
<!-- coordinator: <label or "none"> -->

| Session | Owns | Status | Updated | Hand-offs / assignments | |---------|------|--------|---------|-------------------------| | auth | slug:auth-rework, src/auth/* | executing step 3 | 2026-06-11T14:20 | — | | ui | slug:settings-ui, src/ui/settings/* | drafting plan | 2026-06-11T14:05 | from auth: "changed the token contract — re-read before wiring" | ```

`Session` is a short stable label (the slug it's working on, or a user-given name like `auth`/`ui`). The board carries no secrets — paths + labels only.

## When to run

- `/coordinate` / `/coordinate register` — register (or update) this session on the board.
- `/coordinate check` — read the board: what others own, any hand-offs/assignments for me, any collisions.
- `/coordinate handoff <session> <note>` — leave a note for another session.
- `/coordinate coordinator` — claim (or release) the coordinator role.
- `/coordinate done` — tear down this session's row on close.
- Natural language: "what are other sessions doing", "hand this off to the UI session", "are we colliding".
- Mode A — never auto-fires; never writes the board without the action being invoked.

## Procedure

### Register (start of a work-stream)

1. Resolve this session's **label** (its slug, or ask for a short one). Read the board (create it if absent).
2. **Collision check** before claiming: if another active row `Owns` an overlapping slug or file-scope, surface it — *"`ui` already owns `src/auth/*` (executing step 3). Coordinate before both write there."* Route the resolution to the user (serialize, re-scope, or proceed knowingly) — never auto-resolve.
3. Write/update this session's row: `Owns` (slug + file-scope), `Status`, `Updated` (timestamp from the environment, not invented).

### Check (start + at key moments)

Read the board and surface, concisely: what each other session owns + its status; any **hand-offs/assignments addressed to this session** (act on them — e.g. re-read a changed contract before proceeding); any **collisions**; any **orphan rows** (a session whose `Updated` is stale / that never tore down — flag for the user to clear, don't delete silently).

### Update (on change)

At meaningful checkpoints (step done, a decision, a contract change other sessions depend on, finishing), update this session's `Status` + `Updated`, and **leave a hand-off** when a change affects another session's work.

### Coordinator (optional, opt-in)

A session can `claim` the coordinator role (set `<!-- coordinator: <label> -->`). The coordinator may write **assignment** rows / hand-offs directing other sessions ("ui: take the settings screen next"). Other sessions pick up assignments on their next `check`. Coordinator is advisory shared state — it cannot *force* another session (peers have no parent); it's a way to divide work through the board. Release it on `done`.

### Done (teardown)

On close, remove this session's row (or mark `Status: done`). Surface any hand-offs it left that the target hasn't picked up yet.

## What coordinate does NOT do

- **No daemon, no polling, no background watching.** Sessions can't stream to each other; coordination is read-at-action + write-on-change only.
- **Does not auto-fire or auto-write.** Every board read/write is an invoked action.
- **Does not force another session.** Even the coordinator only writes shared state; peers act on it voluntarily (no parent authority — unlike orchestrate's subagents).
- **Does not auto-resolve collisions.** It surfaces them; the user decides (serialize / re-scope / proceed).
- **Does not commit the board.** Gitignored ephemeral live state.
- **Does not carry secrets.** Labels + paths + status only.

## Relationship to other organs

- **orchestrate** — the *subagent* path (fire-and-forget children, one parent, reconverge). coordinate is the *peer-session* path (no parent, shared board). 070's "board now, orchestrate later": a future increment may fold this into orchestrate's deferred background-session runtime.
- **recap** — per-session episodic close; coordinate is live cross-session state *during* work. A session's `done` teardown pairs naturally with `/recap`.
- **execute / draft-plan / spec** — the per-phase fresh sessions that this board keeps aligned (the fragmentation those phases recommend is what creates the need).

See `.claude/specs/coordinate/v1.md` for the design.
