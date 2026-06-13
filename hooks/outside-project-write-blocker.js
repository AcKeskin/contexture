#!/usr/bin/env node
'use strict';

// Block Write / Edit whose target is outside $CLAUDE_PROJECT_DIR. Default
// allow-list covers ~/.claude/** (config) and ~/.claude/projects/**
// (memory — written constantly per memory-capture discipline).
//
// Extend via ~/.claude/hook-config.json:
//   { "outsideProjectWriteBlocker": { "allow": ["<path-or-glob>", ...] } }

const os = require('os');
const path = require('path');
const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function defaultAllowRoots() {
  const home = os.homedir();
  return [
    path.join(home, '.claude'),
    path.join(os.tmpdir()),
  ];
}

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();

  const rawTarget = (payload.tool_input && (payload.tool_input.file_path || payload.tool_input.path)) || '';
  if (!rawTarget) return io.allow();

  const target = io.resolvePath(rawTarget);
  const root = io.resolvePath(io.projectRoot());

  if (io.isDescendant(target, root)) return io.allow();

  // Default allow-list — always permitted.
  for (const allowed of defaultAllowRoots()) {
    if (io.isDescendant(target, allowed)) return io.allow();
  }

  // User-extended allow-list.
  const cfg = io.hookConfig('outsideProjectWriteBlocker');
  const userAllow = Array.isArray(cfg.allow) ? cfg.allow : [];
  for (const entry of userAllow) {
    const expanded = io.resolvePath(entry);
    if (io.isDescendant(target, expanded)) return io.allow();
    // Also support globs for finer-grained rules.
    const re = io.globToRegex(io.normalise(expanded));
    if (re.test(io.normalise(target))) return io.allow();
  }

  io.block(
    `Blocked: write outside project root. Target: ${target}. Project root: ${root}. ` +
      `Add a path to ~/.claude/hook-config.json under outsideProjectWriteBlocker.allow if intentional.`
  );
}

main().catch(() => io.allow());
