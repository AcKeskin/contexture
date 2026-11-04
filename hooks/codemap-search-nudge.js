#!/usr/bin/env node
'use strict';

// Gets the codemap used, in projects that have .claude/codemap.md:
// - SessionStart (startup/clear/compact): a short orientation slice (overview,
//   modules, top hubs) plus how to search the codemap and how stale it is.
// - SubagentStart: a one-line pointer, since subagents do most of the searching.
// - PreToolUse Grep/Glob: the same pointer on the first search of a session
//   that didn't get the orientation.
// Advisory only. Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');
const { CODEMAP_REL, codemapStaleness } = require('./lib/codemap-state');

const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const SLICE_MAX = 1500;
const MODULES_MAX = 12;
const HUBS_MAX = 5;

function section(text, heading) {
  const start = text.indexOf('\n## ' + heading + '\n');
  if (start === -1) return '';
  const body = text.slice(start + heading.length + 5);
  const end = body.search(/\n## /);
  return end === -1 ? body : body.slice(0, end);
}

function orientation(text) {
  const out = [];
  const overview = section(text, 'Overview').trim();
  if (overview) out.push(overview.length > 300 ? overview.slice(0, 297) + '...' : overview);

  const modules = [];
  let name = null;
  for (const line of section(text, 'Modules').split('\n')) {
    const h = line.match(/^###\s+(.+)$/);
    // Dot folders and the root bucket are config, not layout.
    if (h) name = h[1].trim().startsWith('.') ? null : h[1].trim();
    const r = name && line.match(/^\*\*Role:\*\*\s*(.+)$/);
    if (r) {
      modules.push(`- ${name} ${r[1].trim()}`);
      name = null;
    }
  }
  if (modules.length) out.push('Modules:\n' + modules.slice(0, MODULES_MAX).join('\n'));

  const hubs = [];
  for (const line of section(text, 'Map').split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|$/);
    if (m) hubs.push(`- ${m[1]} (${m[2]} importers)${m[3] ? ' ' + m[3] : ''}`);
  }
  if (hubs.length) out.push('Most-imported files:\n' + hubs.slice(0, HUBS_MAX).join('\n'));

  const slice = out.join('\n\n');
  return slice.length > SLICE_MAX ? slice.slice(0, SLICE_MAX - 3) + '...' : slice;
}

function pointer(root) {
  const s = codemapStaleness(root);
  const stale = s && s.changed ? ` It is ${s.changed} changed file(s) behind, so check what it says against the code.` : '';
  return (
    `This project has a codemap at ${CODEMAP_REL}. Grep it instead of reading it whole: ` +
    '`## Map` and `## Hubs` for where to start, `## Symbol index` for where a name is defined, ' +
    `and the project-memory trace_path tool for callers/callees.${stale}`
  );
}

async function main() {
  const payload = await io.readPayload();
  const event = payload.hook_event_name;
  const root = io.projectRoot();
  const file = path.join(root, CODEMAP_REL);
  if (!fs.existsSync(file)) return io.allow();
  const marker = io.hookStateFile('codemap-nudge', io.sessionId(payload));

  if (event === 'SessionStart') {
    if (!['startup', 'clear', 'compact'].includes(payload.source)) return io.allow();
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return io.allow();
    }
    try {
      fs.writeFileSync(marker, new Date().toISOString() + '\n');
    } catch {
      // The first search may repeat the pointer; harmless.
    }
    const slice = orientation(text);
    return io.addContext('SessionStart', `Project layout, from ${CODEMAP_REL}:\n\n${slice}\n\n${pointer(root)}`);
  }

  if (event === 'SubagentStart') return io.addContext('SubagentStart', pointer(root));

  if (!SEARCH_TOOLS.has(payload.tool_name)) return io.allow();
  if (fs.existsSync(marker)) return io.allow();
  try {
    fs.writeFileSync(marker, new Date().toISOString() + '\n');
  } catch {
    return io.allow();
  }
  io.addContext('PreToolUse', pointer(root));
}

main().catch(() => io.allow());
