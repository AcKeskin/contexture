#!/usr/bin/env node
'use strict';

// Keeps .claude/codemap.md current. Runs on SessionStart (startup/resume) and
// Stop, only in projects that already have a codemap.
//
// Projects with `- refresh: true` under `## Auto-update` in
// .claude/codemap.config.md: when the codemap is behind, regenerate it in a
// detached background process (incremental via the extraction cache, about a
// second on a warm cache). Needs the update-codemap tree-sitter deps; without
// them a refresh would drop to the regex fallback, so it only advises.
//
// Other projects: SessionStart says how many files changed since the codemap
// was written, once it is behind by STALE_AT files. Never regenerates.
//
// `codemap-refresh.js --run <root>` is the background worker. Fails open.

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const io = require('./lib/hook-io');
const { autoUpdateFlag, codemapStaleness } = require('./lib/codemap-state');

const STALE_AT = 5;
const LOCK_REL = '.claude/codemap.refresh.lock';
const LOCK_STALE_MS = 10 * 60 * 1000;
const ENGINE_DIR = path.join(__dirname, '..', 'skills', 'update-codemap');
const ENGINE = path.join(ENGINE_DIR, 'codemap.mjs');

function hasTreeSitter() {
  return fs.existsSync(path.join(ENGINE_DIR, 'node_modules', 'web-tree-sitter'));
}

function takeLock(root) {
  const lock = path.join(root, LOCK_REL);
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
  } catch {
    // No lock yet.
  }
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    return lock;
  } catch {
    return null;
  }
}

function worker(root) {
  const lock = takeLock(root);
  if (!lock) return;
  try {
    execFileSync(process.execPath, [ENGINE, '--root', root, '--quiet'], { stdio: 'ignore', timeout: 5 * 60 * 1000, windowsHide: true });
  } catch {
    // The next trigger retries.
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function startWorker(root) {
  const child = spawn(process.execPath, [__filename, '--run', root], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function behind(s) {
  return s.dirty || (s.changed !== null && s.changed > 0);
}

async function main() {
  const runAt = process.argv.indexOf('--run');
  if (runAt !== -1) return worker(path.resolve(process.argv[runAt + 1] || '.'));

  const payload = await io.readPayload();
  const event = payload.hook_event_name;
  if (event !== 'Stop' && event !== 'SessionStart') return io.allow();
  if (event === 'SessionStart' && !['startup', 'resume'].includes(payload.source)) return io.allow();

  const root = path.resolve(io.projectRoot());
  const s = codemapStaleness(root);
  if (!s || !behind(s)) return io.allow();

  if (autoUpdateFlag(root, 'refresh')) {
    if (hasTreeSitter()) {
      startWorker(root);
      return io.allow();
    }
    if (event === 'SessionStart') {
      return io.addContext(
        'SessionStart',
        'Codemap auto-refresh is on but the update-codemap tree-sitter deps are missing. ' +
          `Run \`npm install\` in ${io.normalise(ENGINE_DIR)} once, or /update-codemap by hand.`
      );
    }
    return io.allow();
  }

  if (event !== 'SessionStart') return io.allow();
  if (!s.dirty && s.changed < STALE_AT) return io.allow();
  const what = s.changed !== null ? `${s.changed} file(s) changed since it was written` : 'files changed since it was written';
  io.addContext(
    'SessionStart',
    `.claude/codemap.md is out of date: ${what}. Trust it for structure, check the code for details. ` +
      'Run /update-codemap to refresh, or add `- refresh: true` under `## Auto-update` in .claude/codemap.config.md to keep it current automatically.'
  );
}

main().catch(() => io.allow());
