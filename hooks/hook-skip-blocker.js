#!/usr/bin/env node
'use strict';

// Block git hook-skip flags: --no-verify, --no-gpg-sign,
// -c commit.gpgsign=false, -c core.hooksPath=...
//
// User arms via `/allow-skip-hooks [N]` which writes:
//   ~/.claude/session-state.json = { "allowSkipHooks": { "count": N, "sessionId": "<id>" } }
// Each permitted call decrements the counter; 0 (or session mismatch) blocks again.

const io = require('./lib/hook-io');

const SKIP_FLAG_PATTERNS = [
  /(^|\s)--no-verify(\s|$)/,
  /(^|\s)--no-gpg-sign(\s|$)/,
  /-c\s+commit\.gpgsign\s*=\s*false/i,
  /-c\s+core\.hooksPath\s*=/i,
];

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();

  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (!/\bgit\b/.test(command)) return io.allow();

  const matched = SKIP_FLAG_PATTERNS.find((re) => re.test(command));
  if (!matched) return io.allow();

  if (consumeArming()) return io.allow();

  io.block(
    `Blocked: git hook-skip flag detected in command. Flags --no-verify, --no-gpg-sign, ` +
      `-c commit.gpgsign=false, and -c core.hooksPath= are protected. ` +
      `Run '/allow-skip-hooks [N]' first to permit the next N calls, or drop the flag. Default N = 1.`
  );
}

function consumeArming() {
  const state = io.sessionState();
  const arm = state.allowSkipHooks;
  if (!arm || typeof arm.count !== 'number' || arm.count <= 0) return false;
  if (arm.sessionId && arm.sessionId !== io.sessionId() && arm.sessionId !== '<unknown>') return false;

  const remaining = arm.count - 1;
  if (remaining > 0) {
    state.allowSkipHooks = { ...arm, count: remaining };
  } else {
    delete state.allowSkipHooks;
  }
  io.writeSessionState(state);
  return true;
}

main().catch(() => io.allow());
