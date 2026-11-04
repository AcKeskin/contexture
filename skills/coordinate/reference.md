# coordinate: reference

Read when the step you are on points here, or when something fails.

## What coordinate does NOT do

- **No daemon, no polling, no background watching.** Sessions can't stream to each other; coordination is read-at-action + write-on-change only. Auto mode fires `check` at natural boundaries (post-register / before-claim / wrap), never on a timer or a background loop.
- **Does not auto-write the manual verbs unless auto mode is enabled.** With auto mode off (the default), every board read/write is an invoked action. With it on, register/check/update/done run auto (ephemeral board only) — but never coordinator assignment (gated) and never collision resolution (asked).
- **Does not auto-resolve collisions.** Detection is auto; the resolution is always the user's decision (serialize / re-scope / proceed) — including under auto mode.
- **Does not auto-evict or auto-remove a stale row.** A possibly-stale or unknown row (per the liveness check) surfaces as a **note**; a human or an explicit command removes it. Auto-eviction is a *silent write with side effects on another session's work* — forbidden by the autonomy rule that a reversible in-workflow step may run unattended but a write affecting another session's work may not. This holds under auto mode: the liveness `stat` is auto (read-only), the eviction is never. Warn-only is not merely a good default here — because mtime cannot distinguish "crashed" from "thinking hard," it is the *only* correct posture.
- **Does not evict on any liveness verdict.** The process check upgrades the *signal* (proof of life on the same host, via the live-session registry with mtime fallback); the *posture* is unchanged — stale warns, the user clears.
- **Does not run a not-ready-isn't-failure retry budget.** Deferred until the board hands out work; its surviving half **is** a standing rule — **any config threaded into an agent-visible prompt is stripped of infra-only flags first**, so infra configuration is never read by an agent as an instruction.
- **Does not auto-assign another session's work.** Coordinator assignment rows stay propose-confirm even in auto mode.
- **Does not force another session.** Even the coordinator only writes shared state; peers act on it voluntarily (no parent authority — unlike orchestrate's subagents).
- **Does not commit the board.** Gitignored ephemeral live state — auto mode does not change that; no auto path ever writes a canonical artefact (memory / spec / changelog / tracked file).
- **Does not carry secrets.** Labels + paths + status only.

## Relationship to other organs

- **orchestrate** — the *subagent* path (fire-and-forget children, one parent, reconverge). coordinate is the *peer-session* path (no parent, shared board). A future increment may fold this into orchestrate's deferred background-session runtime.
- **recap** — per-session episodic close; coordinate is live cross-session state *during* work. A session's `done` teardown pairs naturally with `/recap`.
- **execute / draft-plan / spec** — the per-phase fresh sessions that this board keeps aligned (the fragmentation those phases recommend is what creates the need).
