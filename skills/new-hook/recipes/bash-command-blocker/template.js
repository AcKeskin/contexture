#!/usr/bin/env node
'use strict';

const io = require('./lib/hook-io');

const PATTERN = /__PATTERN__/;
const REASON = '__BLOCK_REASON__';

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name !== 'Bash') return io.allow();
  const command = (payload.tool_input && payload.tool_input.command) || '';
  if (PATTERN.test(command)) return io.block(REASON);
  io.allow();
}

main().catch(() => io.allow());
