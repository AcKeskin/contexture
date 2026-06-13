#!/usr/bin/env node
'use strict';

// Block Write / Edit operations targeting secret-bearing files: .env*,
// *credentials*, *secrets*, *api_keys*, *.pem, *.key, *.p12, *.pfx.
// Reads are allowed — Claude often needs to know these files exist.
//
// Override via ~/.claude/hook-config.json:
//   { "envFileWriteBlocker": { "allow": ["<glob>", ...] } }

const path = require('path');
const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const SECRET_PATTERNS = [
  /^\.env$/i,
  /^\.env\..+$/i,
  /credentials/i,
  /secrets/i,
  /api[_-]?keys?/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
];

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();

  const filePath = (payload.tool_input && (payload.tool_input.file_path || payload.tool_input.path)) || '';
  if (!filePath) return io.allow();

  const basename = path.basename(filePath);
  const matched = SECRET_PATTERNS.find((re) => re.test(basename));
  if (!matched) return io.allow();

  if (isAllowed(filePath)) return io.allow();

  io.block(
    `Blocked: write to secret-like file '${filePath}' (pattern ${matched}). Reading is allowed; writing is not. ` +
      `If intentional, add a glob to ~/.claude/hook-config.json under envFileWriteBlocker.allow.`
  );
}

function isAllowed(filePath) {
  const cfg = io.hookConfig('envFileWriteBlocker');
  const allow = Array.isArray(cfg.allow) ? cfg.allow : [];
  if (allow.length === 0) return false;

  const normalised = io.normalise(path.resolve(filePath));
  for (const glob of allow) {
    const re = io.globToRegex(io.normalise(glob));
    if (re.test(normalised) || re.test(path.basename(filePath))) return true;
  }
  return false;
}

main().catch(() => io.allow());
