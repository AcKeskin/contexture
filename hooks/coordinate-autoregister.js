#!/usr/bin/env node
'use strict';

// SessionStart hook: when coordinate auto mode is enabled, surface a nudge to
// auto-register this session on the shared board (.claude/sessions-active.md) and
// run the start-of-session `check`.
//
// Sibling of wrap-terminus-recovery.js and clear-context-decision-guard.js: same
// SessionStart lifecycle, same off-by-default enablement, same surfacing channel
// (`hookSpecificOutput.additionalContext`) — a SEPARATE thin hook (single
// responsibility: board register/check nudge) rather than folding an unrelated
// job into the wrap hook.
// Deliberately dumb: it does not itself write the board (the board write is the
// coordinate skill's action, keyed off this nudge) — it surfaces that auto mode
// is on and the session should register + check. Fails open.
//
// Off by default. Fires only when hook-config.json enables `coordinateAuto`. The
// board is gitignored/ephemeral, so even when enabled this carries zero
// canonical-write risk.

const io = require('./lib/hook-io');

async function main() {
  // Fires on every SessionStart source (settings matcher covers all four);
  // register at any session begin — teardown is /wrap's job, not this hook's.
  await io.readPayload();

  // Opt-in gate: silent unless hook-config enables coordinateAuto.
  if (io.hookConfig('coordinateAuto').enabled !== true) return io.allow();

  const message =
    'Coordinate auto mode is on. Register this session on the shared board ' +
    '(.claude/sessions-active.md) and run a start-of-session check — surface what other ' +
    'sessions own and any hand-offs/collisions addressed to this one. The board is ' +
    'gitignored/ephemeral; under ask=forks-only the register/check run without a per-action ' +
    'confirm. A collision, if any, is surfaced for your decision — never auto-resolved.';

  io.addContext('SessionStart', message);
}

main().catch(() => io.allow());
