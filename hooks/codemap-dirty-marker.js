#!/usr/bin/env node
'use strict';

// PostToolUse hook: when a Write/Edit/MultiEdit/NotebookEdit touches a file
// inside the project root AND the project opts in via .claude/codemap.config.md
// containing an `## Auto-update` section with `enabled: true`, mark the codemap
// stale by touching `.claude/codemap.dirty`.
//
// The sentinel is a freshness flag, not a rebuild trigger — /update-codemap
// reads it on next manual run to tell the user the codemap is out of date.
// Skill `codemap-visualize` also surfaces the flag.
//
// Fails open: any error path allows the tool call to proceed.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const CONFIG_REL = '.claude/codemap.config.md';
const DIRTY_REL = '.claude/codemap.dirty';
const CODEMAP_REL = '.claude/codemap.md';

function isAutoUpdateEnabled(configText) {
  // Find `## Auto-update` heading (exact, case-sensitive), then look for
  // `enabled: true` on a non-blank line before the next `##` heading or EOF.
  const lines = configText.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+Auto-update\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) return false;
    if (inSection && /^\s*-?\s*enabled\s*:\s*true\s*$/i.test(line)) return true;
  }
  return false;
}

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();

  const rawTarget = (payload.tool_input && (payload.tool_input.file_path || payload.tool_input.path)) || '';
  if (!rawTarget) return io.allow();

  const target = io.resolvePath(rawTarget);
  const root = io.resolvePath(io.projectRoot());

  // Only react to writes inside the project tree.
  if (!io.isDescendant(target, root)) return io.allow();

  // Never mark dirty for writes to the codemap itself, the dirty sentinel, or
  // the diagrams artifact — those are produced *by* the codemap pipeline.
  const normTarget = io.normalise(target);
  const normRoot = io.normalise(root).replace(/\/$/, '');
  const codemapPath = normRoot + '/' + CODEMAP_REL;
  const dirtyPath = normRoot + '/' + DIRTY_REL;
  const diagramsPath = normRoot + '/.claude/codemap.diagrams.md';
  if (normTarget === codemapPath || normTarget === dirtyPath || normTarget === diagramsPath) {
    return io.allow();
  }

  // Opt-in gate.
  const configPath = path.join(root, CONFIG_REL);
  if (!fs.existsSync(configPath)) return io.allow();

  let configText;
  try {
    configText = fs.readFileSync(configPath, 'utf8');
  } catch {
    return io.allow();
  }

  if (!isAutoUpdateEnabled(configText)) return io.allow();

  // Mark dirty. Idempotent — overwrite with current timestamp.
  try {
    const dirtyAbs = path.join(root, DIRTY_REL);
    fs.mkdirSync(path.dirname(dirtyAbs), { recursive: true });
    fs.writeFileSync(dirtyAbs, new Date().toISOString() + '\n');
  } catch {
    // Swallow — never block the user's write because we couldn't touch a sentinel.
  }

  return io.allow();
}

main().catch(() => io.allow());
