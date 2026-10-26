'use strict';

// Finds `path:line` and `path:start-end` citations in a subagent's response and
// reports the ones that do not resolve to a real line. Pure apart from file
// reads, so the agent-output hook and its tests share one implementation.

const fs = require('fs');
const path = require('path');

// A path ending in a file extension, then :line, optional -end or :col.
// The lookbehind skips URL tails (https://host/a.js:10) and mid-word matches.
const CITE_RE = /(?<![\w/\\.:@-])((?:[A-Za-z]:)?[\\/]?(?:[\w.@-]+[\\/])*[\w.@-]+\.[A-Za-z0-9]{1,8}):(\d+)(?:-(\d+))?(?::\d+)?(?![\w])/g;
// Absolute paths in the dispatch prompt; their folders become extra bases.
const ABS_PATH_RE = /(?:[A-Za-z]:[\\/]|(?<![\w.])\/)[^\s'"`<>()|]+/g;
const MAX_CITATIONS = 60;
const MAX_ANCESTORS = 6;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function extractCitations(text) {
  const seen = new Set();
  const out = [];
  CITE_RE.lastIndex = 0;
  let m;
  while ((m = CITE_RE.exec(text)) !== null && out.length < MAX_CITATIONS) {
    const start = Number(m[2]);
    const end = m[3] ? Number(m[3]) : start;
    const key = m[1] + ':' + start + '-' + end;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: m[0], file: m[1], start, end });
  }
  return out;
}

// cwd and project root first, then each absolute path in the prompt and its
// parent folders, so a citation relative to a folder the prompt named resolves.
function baseDirs(cwd, projectRoot, promptText) {
  const bases = [];
  const add = (d) => { if (d && !bases.includes(d)) bases.push(d); };
  add(cwd);
  add(projectRoot);
  ABS_PATH_RE.lastIndex = 0;
  let m;
  while ((m = ABS_PATH_RE.exec(promptText || '')) !== null) {
    let dir = m[0].replace(/[.,;:]+$/, '');
    for (let i = 0; i < MAX_ANCESTORS; i++) {
      add(dir);
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return bases;
}

function resolveFile(file, bases) {
  if (path.isAbsolute(file)) return isFile(file) ? file : null;
  for (const base of bases) {
    const candidate = path.resolve(base, file);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

// A missing file counts as a bad citation only when its folder exists here.
// Otherwise the path most likely names a file in another repo (a research
// agent quoting a GitHub tree), which this machine cannot judge.
function parentExists(file, bases) {
  const dir = path.dirname(file);
  const candidates = path.isAbsolute(dir) ? [dir] : bases.map((b) => path.resolve(b, dir));
  return candidates.some((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function lineCount(file, cache) {
  if (cache.has(file)) return cache.get(file);
  let count = null;
  try {
    if (fs.statSync(file).size <= MAX_FILE_BYTES) {
      const text = fs.readFileSync(file, 'utf8');
      count = text.length === 0 ? 0 : text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);
    }
  } catch {
    count = null;
  }
  cache.set(file, count);
  return count;
}

// Returns [{ raw, reason }] for citations that point past the end of a real
// file, or at a missing file inside a folder that does exist. A bare filename
// that resolves nowhere is skipped: it may live anywhere, so it proves nothing.
function findBrokenCitations(text, { cwd, projectRoot, promptText } = {}) {
  const bases = baseDirs(cwd, projectRoot, promptText);
  const cache = new Map();
  const broken = [];
  for (const c of extractCitations(text || '')) {
    const resolved = resolveFile(c.file, bases);
    if (!resolved) {
      if (/[\\/]/.test(c.file) && parentExists(c.file, bases)) {
        broken.push({ raw: c.raw, reason: 'no such file' });
      }
      continue;
    }
    const lines = lineCount(resolved, cache);
    if (lines === null) continue;
    if (c.start < 1 || c.end > lines || c.end < c.start) {
      broken.push({ raw: c.raw, reason: 'file has ' + lines + ' lines' });
    }
  }
  return broken;
}

module.exports = { extractCitations, baseDirs, findBrokenCitations };
