#!/usr/bin/env node
'use strict';

const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const PATH_GLOB = '__PATH_GLOB__';
const REASON = '__BLOCK_REASON__';

const PATH_REGEX = io.globToRegex(io.normalise(PATH_GLOB));

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();

  const filePath = (payload.tool_input && (payload.tool_input.file_path || payload.tool_input.path)) || '';
  if (!filePath) return io.allow();

  const normalised = io.normalise(filePath);
  if (PATH_REGEX.test(normalised)) return io.block(REASON);
  io.allow();
}

main().catch(() => io.allow());
