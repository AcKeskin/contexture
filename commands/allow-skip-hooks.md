---
description: Arm the hook-skip-blocker to permit the next N git commands with --no-verify / --no-gpg-sign / -c commit.gpgsign=false / -c core.hooksPath=. Default N = 1.
---

Arm the session-scoped counter that lets `hook-skip-blocker` pass subsequent git commands using skip flags. The counter lives in `~/.claude/session-state.json` and decrements on every permitted call.

Usage:
- `/allow-skip-hooks` — arm the next 1 call.
- `/allow-skip-hooks 3` — arm the next 3 calls.
- `/allow-skip-hooks 0` — disarm immediately.

Procedure:

1. Parse `$ARGUMENTS`. If empty, N = 1. If non-numeric, stop and explain.
2. Read `~/.claude/session-state.json` (default `{}` if missing).
3. If N > 0, set `state.allowSkipHooks = { count: N, sessionId: <$CLAUDE_SESSION_ID or "<unknown>"> }`.
4. If N === 0, delete `state.allowSkipHooks`.
5. Write the merged state back (preserve other keys).
6. Confirm to the user: *"hook-skip-blocker armed for next N calls"* or *"hook-skip-blocker disarmed"*.

Only exists to give the user an explicit, auditable opt-in when a legitimate reason to bypass git hooks arises (e.g. a broken pre-commit after a repo change). The flag never auto-arms; every bypass is a deliberate user action.

See `~/.claude/hooks/hook-skip-blocker.js` and `~/.claude/docs/security-hooks.md` for the full protocol.
