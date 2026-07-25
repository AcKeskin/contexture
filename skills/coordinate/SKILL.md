---
name: coordinate
description: Keep multiple live Claude sessions aligned via a shared, file-based session board (.claude/sessions-active.md, gitignored) — register what this session owns, see what the others own, leave hand-off notes, and detect file/slug collisions. A session can claim coordinator to assign work to others. No daemon/polling — read at start + key moments, write on change. Use on /coordinate [register|check|handoff|coordinator|done], "what are other sessions doing", "hand off to the other session". Mode A.
---

# coordinate

Multi-session coordination. The pipeline *tells you to fragment* — `/spec` and `/draft-plan` recommend a fresh session per phase — so when you plan several things and spin up multiple live sessions (a `/execute` window per work-stream), they drift: session A doesn't know what B decided. `coordinate` is the **shared memory those live, peer sessions coordinate through.**

It is **not** `orchestrate` (which dispatches fire-and-forget *subagents* within one session and reconverges them). These are independent, user-driven **peer sessions** with no parent — so coordination is a **passive shared board**, read-at-action and written-on-change, no daemon or polling. (Folding this into orchestrate's deferred background-session runtime is a later increment.)

## The board

`<project-root>/.claude/sessions-active.md` — **gitignored, ephemeral live state** (add `.claude/sessions-active.md` to `.gitignore` if `.claude/` isn't already ignored). One row per active session:

```markdown
# Active sessions
<!-- coordinator: <label or "none"> -->

| Session | Owns | Status | Updated | Hand-offs / assignments |
|---------|------|--------|---------|-------------------------|
| auth    | slug:auth-rework, src/auth/* | executing step 3 | 2026-06-11T14:20 | — |
| ui      | slug:settings-ui, src/ui/settings/* | drafting plan | 2026-06-11T14:05 | from auth: "changed the token contract — re-read before wiring" |
```

`Session` is a short stable label (the slug it's working on, or a user-given name like `auth`/`ui`). The board carries no secrets — paths + labels only.

**Hidden identity block (write-authority + liveness).** Below the visible table, a hidden HTML-comment block maps each label to the session that owns it:

```markdown
<!-- identities
auth = { session: e3bd7da4-..., host: DESKTOP-X }
ui   = { session: 1a2b3c4d-..., host: DESKTOP-X }
-->
```

Two mechanisms read this block, both detailed below: a **write-authority check** (a row-mutating write must come from the session whose identity is recorded, else it is rejected-and-recorded — see Update) and a **liveness check** (a row is live only while its owning session's transcript is still being written — see Check). The block stays hidden so the visible table is unchanged; it still carries no secrets — a `session_id` is already on disk as a transcript filename, and `host` is a machine name. The **transcript path is derived, not stored**: `~/.claude/projects/<canonical-cwd-slug>/<session_id>.jsonl`.

## When to run

- `/coordinate` / `/coordinate register` — register (or update) this session on the board.
- `/coordinate check` — read the board: what others own, any hand-offs/assignments for me, any collisions.
- `/coordinate handoff <session> <note>` — leave a note for another session.
- `/coordinate coordinator` — claim (or release) the coordinator role.
- `/coordinate done` — tear down this session's row on close.
- Natural language: "what are other sessions doing", "hand this off to the UI session", "are we colliding".
- Mode A for the *manual* verbs. The board can also run **auto** — see Auto mode (opt-in, off by default).

## Auto mode (opt-in, `enabled:false` by default)

The board is **gitignored, ephemeral live state** — not a memory, not a spec, not the changelog. So every board write falls *outside* the never-silent-write set: confirming each `register`/`check`/`update`/`done` is pure ceremony with no canonical-write risk behind it. Auto mode dials those board ops up so the user stops proc'ing every read and write.

**Gated on the autonomy contract's `ask` field** (read the effective [autonomize](../autonomize/SKILL.md) contract) and on the hook-config `enabled` flag (defaults **off** — opt in per session) (the `coordinate-autoregister.js` hook, registered under `hook-config.json`):

- **`ask=forks-only` / `until-blocked`** → `register` (at session start), `check` (at the boundaries below), `update` (on an owned-scope change), and `done` (at `/wrap`) run **auto**, no per-action confirm. All write only the ephemeral board.
- **`ask=every-step`** → revert to today's behavior: every board read/write is an invoked action (the user opted into confirmation).

The one thing auto mode **never** does on its own: resolve a collision (see Check below). Detection is auto; the decision is always the user's.

## Procedure

### Register (start of a work-stream)

1. Resolve this session's **label** (its slug, or ask for a short one). Read the board (create it if absent).
2. **Collision check** before claiming: if another active row `Owns` an overlapping slug or file-scope, surface it — *"`ui` already owns `src/auth/*` (executing step 3). Coordinate before both write there."* Route the resolution to the user (serialize, re-scope, or proceed knowingly) — never auto-resolve.
3. Write/update this session's row: `Owns` (slug + file-scope), `Status`, `Updated` (timestamp from the environment, not invented).
4. **Record this session's identity.** Read this session's `session_id` from the environment-surfaced session path — the scratchpad path's UUID *is* the session_id, and it maps to the transcript `~/.claude/projects/<slug>/<session_id>.jsonl`. Write `{ session: <session_id>, host: <hostname> }` into the identity block for this label. The id is **read, never invented** — an invented id defeats the whole point of attribution. If the session path genuinely cannot be resolved, record `host`-only and mark the row unverifiable rather than fabricating an id; the write-authority and liveness checks then degrade to "unknown" for this row (never to a false match or a false "dead").

### Check (at boundaries)

Read the board and surface, concisely: what each other session owns + its status; any **hand-offs/assignments addressed to this session** (act on them — e.g. re-read a changed contract before proceeding); any **collisions**; any **rejection notes** left by the write-authority check (a mismatched write happened — surface it, it means two sessions disagree about who owns a row); any **stale rows** (see liveness below — flag for the user to clear, don't delete silently).

**Liveness — judge by transcript mtime, not the `Updated` column.** The `Updated` timestamp is *self-reported*: a hung session may have written it just before hanging, and a healthy session mid-long-turn may not have refreshed it. So it stays in the table as a human-readable hint but is **no longer the liveness signal.** Instead, for each row, resolve the owning session's transcript from its recorded `session_id` (`~/.claude/projects/<slug>/<session_id>.jsonl`) and `stat` its mtime — a single, fast, cross-platform check that rides this existing read, no background watcher:

- **mtime within the threshold** → live; honour the claim.
- **mtime older than the threshold** → surface as **possibly stale** (*"owner may be gone"*) — a note, never an eviction.
- **transcript not present on this host** (a synced or SSH-shared home can hold another host's transcripts, whose sessions this machine cannot see) → **unknown**, never stale-and-reclaimable. Absence of the file here is not evidence of death there.

**Threshold: 15 minutes of no transcript write.** Deliberately generous — mtime is *evidence of activity, not proof of life* (it cannot tell a crashed session from one thinking through a long single turn that writes nothing to the transcript for minutes), and since a stale row only ever *warns* (never evicts — see below), a false "possibly stale" on a slow-but-live session costs a dismissible note while a too-eager threshold would cry wolf. When in doubt, longer.

**Under auto mode, `check` fires at exactly three boundaries — not mid-turn, not on a timer:**
1. **Right after auto-register** (session start) — surface the current board so the session starts aware.
2. **Right before this session claims a new scope** — the load-bearing catch: this is the moment a collision matters (two sessions about to write the same scope). No hook channel exists mid-session, so detection rides this natural read rather than a background watcher.
3. **At `/wrap`** (session close) — surface any hand-offs this session left that the target hasn't picked up.

**Collision handling — surface-and-ask, never auto-resolve.** When a `check` (especially the before-claim one) finds another active row `Owns`-overlapping this session's intended scope, surface it and route the resolution to the user — *serialize / re-scope / proceed-knowingly*. This holds under auto mode too: detecting the collision is auto (read-only), but **the resolution is a decision, not a write** — it is always asked, never auto-resolved.

### Update (on change)

At meaningful checkpoints (step done, a decision, a contract change other sessions depend on, finishing), update this session's `Status` + `Updated`, and **leave a hand-off** when a change affects another session's work.

**Row ownership — the race-safety rule (auto mode).** Each session **writes only its own row** (append its row if absent, update its own line otherwise). Concurrent auto-writes target different rows, but the board is one file: a stale read-modify-write can still drop another session's row. Re-read the board immediately before every write; if a row you didn't touch changed since your read, re-apply your edit on the fresh content. Failure mode: last-write-loses on a true simultaneous write — detectable at the next `check` (your row missing → re-register and note the collision). No file lock — a lock on gitignored ephemeral state buys stale-lock failure modes for no gain. (This is why auto-register/update are race-safe to run without a confirm.)

**Write-authority check — identity must match before a row's OWN state is mutated.** The check governs writes that change a row's *own* state: its `Owns`, `Status`, recorded identity, or its removal. Before such a write, compare the writer's `session_id` against the identity recorded for that row's label. Writing your **own** row matches trivially — the common path, unaffected.

- **Match** (your own row) → apply.
- **Mismatch** (another session's own-state) → **reject and record.** Do *not* apply, and do *not* silently drop — write a short dated rejection note onto the contested row (or a rejection line under the board): *"rejected &lt;field&gt; write from &lt;writer-label&gt; — row owned by &lt;recorded-label&gt;."* A mismatched write is **evidence** — a confused session, a stale board re-read, a session resumed from old context — and dropping it destroys that evidence — a rejected write is how two sessions disagreeing about board state *surface* that disagreement instead of silently resolving it. The rejection is read at the next `Check`.

**Not gated — addressed communication.** Leaving a **hand-off/assignment in another row's `Hand-offs` column** is *addressed-to* that session, not a mutation of its own state, and stays allowed for any session (the existing `handoff` verb) — that is how peers talk. A **coordinator writing an assignment** to another row is likewise allowed (it is the coordinator's purpose) and stays **propose-confirm** as it already is, not auto. The identity check blocks *impersonating another session's ownership*, never *communicating with it*.

Unverifiable rows (identity recorded `host`-only, per Register step 4) are treated as **unknown**, not as a free-for-all: surface the ambiguity to the user rather than either applying or hard-rejecting.

### Coordinator (optional, opt-in)

A session can `claim` the coordinator role (set `<!-- coordinator: <label> -->`). The coordinator may write **assignment** rows / hand-offs directing other sessions ("ui: take the settings screen next"). Other sessions pick up assignments on their next `check`. Coordinator is advisory shared state — it cannot *force* another session (peers have no parent); it's a way to divide work through the board. Release it on `done`.

**Coordinator assignment stays gated even in auto mode.** Auto mode dials up a session's *own* board ops (register/check/update/done for its own row). But a coordinator writing an **assignment row for another session** is a decision affecting a different agent — closer to a fork than a self-status update — so it stays **propose-confirm**, not auto, regardless of the `ask` posture. Writing your own status is routine; assigning someone else's work is not.

### Done (teardown)

On close, remove this session's row (or mark `Status: done`). Surface any hand-offs it left that the target hasn't picked up yet.

## What coordinate does NOT do

- **No daemon, no polling, no background watching.** Sessions can't stream to each other; coordination is read-at-action + write-on-change only. Auto mode fires `check` at natural boundaries (post-register / before-claim / wrap), never on a timer or a background loop.
- **Does not auto-write the manual verbs unless auto mode is enabled.** With auto mode off (the default), every board read/write is an invoked action. With it on, register/check/update/done run auto (ephemeral board only) — but never coordinator assignment (gated) and never collision resolution (asked).
- **Does not auto-resolve collisions.** Detection is auto; the resolution is always the user's decision (serialize / re-scope / proceed) — including under auto mode.
- **Does not auto-evict or auto-remove a stale row.** A possibly-stale or unknown row (per the liveness check) surfaces as a **note**; a human or an explicit command removes it. Auto-eviction is a *silent write with side effects on another session's work* — forbidden by the autonomy rule that a reversible in-workflow step may run unattended but a write affecting another session's work may not. This holds under auto mode: the liveness `stat` is auto (read-only), the eviction is never. Warn-only is not merely a good default here — because mtime cannot distinguish "crashed" from "thinking hard," it is the *only* correct posture.
- **Does not do an authoritative process-liveness check.** v1 uses transcript mtime — evidence of activity, not proof of life.
- **Does not run a not-ready-isn't-failure retry budget.** Deferred until the board hands out work; its surviving half **is** a standing rule — **any config threaded into an agent-visible prompt is stripped of infra-only flags first**, so infra configuration is never read by an agent as an instruction.
- **Does not auto-assign another session's work.** Coordinator assignment rows stay propose-confirm even in auto mode.
- **Does not force another session.** Even the coordinator only writes shared state; peers act on it voluntarily (no parent authority — unlike orchestrate's subagents).
- **Does not commit the board.** Gitignored ephemeral live state — auto mode does not change that; no auto path ever writes a canonical artefact (memory / spec / changelog / tracked file).
- **Does not carry secrets.** Labels + paths + status only.

## Relationship to other organs

- **orchestrate** — the *subagent* path (fire-and-forget children, one parent, reconverge). coordinate is the *peer-session* path (no parent, shared board). A future increment may fold this into orchestrate's deferred background-session runtime.
- **recap** — per-session episodic close; coordinate is live cross-session state *during* work. A session's `done` teardown pairs naturally with `/recap`.
- **execute / draft-plan / spec** — the per-phase fresh sessions that this board keeps aligned (the fragmentation those phases recommend is what creates the need).
