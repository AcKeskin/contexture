#!/usr/bin/env node
'use strict';

// PreToolUse hook (Grep/Glob): the first search of a session in a project
// with .claude/codemap.md points at the codemap before broad searching, and
// says how stale it is. Once per session. Advisory only. Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');
const { CODEMAP_REL, codemapStaleness } = require('./lib/codemap-state');

const SEARCH_TOOLS = new Set(['Grep', 'Glob']);

async function main() {
  const payload = await io.readPayload();
  if (!SEARCH_TOOLS.has(payload.tool_name)) return io.allow();
  const root = io.projectRoot();
  if (!fs.existsSync(path.join(root, CODEMAP_REL))) return io.allow();

  const marker = io.hookStateFile('codemap-nudge', io.sessionId(payload));
  if (fs.existsSync(marker)) return io.allow();
  try {
    fs.writeFileSync(marker, new Date().toISOString() + '\n');
  } catch {
    return io.allow();
  }

  const s = codemapStaleness(root);
  const stale = s && s.changed ? ` It is ${s.changed} changed file(s) behind, so check what it says against the code.` : '';
  io.addContext(
    'PreToolUse',
    `This project has a codemap at ${CODEMAP_REL}. Grep it instead of reading it whole: ` +
      '`## Map` and `## Hubs` for where to start, `## Symbol index` for where a name is defined, ' +
      `and the project-memory trace_path tool for callers/callees.${stale}`
  );
}

main().catch(() => io.allow());
