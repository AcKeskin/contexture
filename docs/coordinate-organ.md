# Coordinate — multi-session alignment

Implements. Authoritative procedure: [`skills/coordinate/SKILL.md`](../skills/coordinate/SKILL.md); this doc is the Claude-facing reference.

## What it is

The pipeline *tells you to fragment* — `/spec` and `/draft-plan` recommend a fresh session per phase — so when you plan several things and spin up multiple live sessions (a `/execute` window per work-stream), they drift: session A doesn't know what B decided. `coordinate` is the **shared memory those live, peer sessions coordinate through.**

It is **not** `orchestrate` (which dispatches fire-and-forget *subagents* within one session and reconverges them). These are independent, user-driven **peer sessions** with no parent — so coordination is a **passive shared board**, read-at-action and written-on-change, no daemon or polling. (Folding this into orchestrate's deferred background-session runtime is a later increment — "board now, orchestrate later".)

## The board

`<project-root>/.claude/sessions-active.md` — **gitignored, ephemeral** live state, carrying **no secrets** (labels + paths + status only). One row per active session: `Session` (a short stable label — the slug, or a user-given name) / `Owns` (slug + file-scope) / `Status` / `Updated` (a real timestamp) / `Hand-offs / assignments`. A `<!-- coordinator: <label> -->` marker records the optional coordinator.

## Actions

- **register** — write/update this session's row, after a **collision check** (overlapping slug/file-scope with another active row → surfaced for the user to resolve, never auto-resolved).
- **check** — read the board: others' status, **hand-offs/assignments addressed to this session**, collisions, and **orphan rows** (stale `Updated` / never torn down — flagged, not silently deleted).
- **handoff `<session> <note>`** — leave a note for another session.
- **coordinator** — claim/release the coordinator role; a coordinator may write **assignment** rows others pick up on `check`. Advisory — it cannot *force* a peer (no parent authority).
- **done** — tear down this session's row on close (pairs with `/recap`).

## What coordinate is not

- No daemon, polling, or background watching (sessions can't stream to each other). Does not auto-fire or auto-write. Does not force another session. Does not auto-resolve collisions (surfaces them). Does not commit the board or carry secrets.

## Relationship to other organs

- **orchestrate** — the *subagent* path (fire-and-forget children, one parent, reconverge); coordinate is the *peer-session* path. **recap** — per-session episodic close; coordinate is live cross-session state *during* work. **execute / draft-plan / spec** — the per-phase fresh sessions this board keeps aligned.
