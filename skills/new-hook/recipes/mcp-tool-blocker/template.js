#!/usr/bin/env node
'use strict';

const io = require('./lib/hook-io');

const TOOL_NAME = '__TOOL_NAME__';
const REASON = '__BLOCK_REASON__';

async function main() {
  const payload = await io.readPayload();
  if (payload.tool_name === TOOL_NAME) return io.block(REASON);
  io.allow();
}

main().catch(() => io.allow());
