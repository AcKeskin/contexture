'use strict';

// How far .claude/codemap.md is behind the working tree, and the per-project
// auto-update settings in .claude/codemap.config.md. Shared by the codemap hooks.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CODEMAP_REL = '.claude/codemap.md';
const CONFIG_REL = '.claude/codemap.config.md';
const DIRTY_REL = '.claude/codemap.dirty';

// `key: true` inside the `## Auto-update` section, before the next `##`.
function autoUpdateFlag(root, key) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, CONFIG_REL), 'utf8');
  } catch {
    return false;
  }
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+Auto-update\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) return false;
    if (inSection && new RegExp('^\\s*-?\\s*' + key + '\\s*:\\s*true\\s*$', 'i').test(line)) return true;
  }
  return false;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
}

// null when there is no codemap. Otherwise { changed, dirty }: `changed` counts
// files under root that changed after the codemap was written (null outside
// git). A file counts when its mtime is newer than the codemap, or it is gone;
// so work committed after a regen it was already part of does not count.
function codemapStaleness(root) {
  let mtime;
  try {
    mtime = fs.statSync(path.join(root, CODEMAP_REL)).mtimeMs;
  } catch {
    return null;
  }
  const dirty = fs.existsSync(path.join(root, DIRTY_REL));
  const candidates = new Set();
  try {
    // Git prints repo-relative paths; strip root's prefix when root is a subfolder.
    const prefix = git(root, ['rev-parse', '--show-prefix']).trim();
    const add = (f) => {
      f = f.trim().replace(/^"|"$/g, '');
      if (f && f.startsWith(prefix)) candidates.add(f.slice(prefix.length));
    };
    const since = '@' + Math.floor(mtime / 1000);
    for (const f of git(root, ['log', '--since=' + since, '--name-only', '--pretty=format:', '--', '.']).split('\n')) add(f);
    for (const line of git(root, ['status', '--porcelain', '--untracked-files=normal', '--', '.']).split('\n')) {
      add(line.slice(3).replace(/^.* -> /, ''));
    }
  } catch {
    return { changed: null, dirty };
  }
  let changed = 0;
  for (const f of candidates) {
    if (f.startsWith('.claude/')) continue;
    try {
      if (fs.statSync(path.join(root, f)).mtimeMs > mtime) changed++;
    } catch {
      changed++; // Deleted: counts as a change.
    }
  }
  return { changed, dirty };
}

module.exports = { CODEMAP_REL, autoUpdateFlag, codemapStaleness };
