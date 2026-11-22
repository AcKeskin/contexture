// Code for the map page: file text to show symbol snippets, and a git diff to mark changed lines.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDiff } from '../review/gate-scan.mjs';

export const FILE_CAP = 200 * 1024; // bigger files are left out; the page links to the editor instead
const DEL_CAP = 200; // removed lines kept per block; the rest is counted
const PROSE = new Set(['markdown', 'other']);

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);

// Text of the code files, most useful first, until `budget` bytes are used.
// Changed files come first, then entry points and `first` (tour stops), then the most imported.
// `stale`: files whose text no longer matches the codemap hash, so symbol lines may be off.
export function readSources(root, json, { budget, isSkipped = () => false, diff = null, first = [] } = {}) {
  const changed = new Set(Object.keys(diff?.files || {}));
  const entries = new Set([...(json.entryPoints || []).map((e) => e.rel), ...first]);
  const rank = (rel) => (changed.has(rel) ? 0 : entries.has(rel) ? 1 : 2);
  const rels = Object.entries(json.files || {})
    .filter(([rel, f]) => !isSkipped(rel) && !f.vendored && (changed.has(rel) || (f.symbols?.length && !PROSE.has(f.lang))))
    .sort(([a, fa], [b, fb]) => rank(a) - rank(b) || (fb.importedBy || []).length - (fa.importedBy || []).length || a.localeCompare(b))
    .map(([rel]) => rel);
  const text = {};
  const stale = [];
  const left = [];
  let used = 0;
  for (const rel of rels) {
    let t;
    try {
      const abs = path.join(root, rel);
      if (fs.statSync(abs).size > FILE_CAP) { left.push(rel); continue; }
      t = fs.readFileSync(abs, 'utf8');
    } catch { continue; } // deleted since the codemap was built
    if (used + t.length > budget) { left.push(rel); continue; }
    used += t.length;
    text[rel] = t;
    if (json.files[rel].hash && hashOf(t) !== json.files[rel].hash) stale.push(rel);
  }
  return { text, stale, left, bytes: used };
}

const git = (root, args) => execFileSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// Lines changed since `ref`, per file, in the current file's line numbers:
//   { status: 'added'|'modified'|'deleted', add: [[from, to]], del: [{ at, lines, more? }] }
// A `del` block sat just above line `at`. Parsing is review's gate-scan parseDiff.
export function changedLines(text) {
  const files = {};
  for (const f of parseDiff(text)) {
    const d = files[f.path] = { status: f.deleted ? 'deleted' : f.created ? 'added' : 'modified', add: [], del: [] };
    if (f.deleted) continue;
    for (const h of f.hunks) {
      for (const { line } of h.add) {
        const last = d.add[d.add.length - 1];
        if (last && last[1] === line - 1) last[1] = line; else d.add.push([line, line]);
      }
      // With -U0 a hunk with no added lines starts at the line before the removed ones.
      const shift = h.add.length ? 0 : 1;
      for (const { line, text: t } of h.del) {
        let b = d.del[d.del.length - 1];
        if (!b || b.at !== line + shift) d.del.push(b = { at: line + shift, lines: [] });
        if (b.lines.length < DEL_CAP) b.lines.push(t); else b.more = (b.more || 0) + 1;
      }
    }
    if (f.created) d.del = [];
  }
  return files;
}

export function readDiff(root, ref) {
  let sha;
  try { sha = git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim(); } catch { sha = ''; }
  if (!sha) throw new Error(`not a commit in this repo: ${ref}`);
  // Fixed a/ b/ prefixes whatever diff.noprefix says; --relative keeps paths relative to root (a map of a subfolder).
  const files = changedLines(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', '--relative', sha, '--']));
  for (const rel of git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    if (files[rel]) continue;
    let n = 0;
    try { const t = fs.readFileSync(path.join(root, rel), 'utf8'); n = t === '' ? 0 : t.split('\n').length - (t.endsWith('\n') ? 1 : 0); } catch { continue; }
    files[rel] = { status: 'added', add: n ? [[1, n]] : [], del: [] };
  }
  return { ref, sha: sha.slice(0, 12), files };
}
