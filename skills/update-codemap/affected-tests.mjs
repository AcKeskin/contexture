#!/usr/bin/env node
// Which tests a change reaches, from the codemap's `## File deps`.
//
//   node affected-tests.mjs [--root <dir>] [--codemap <path>] [--base <ref>] [-- <file>...]
//
// Changed files: the ones after `--`, else `git diff --name-only <base>...HEAD` (with --base)
// plus uncommitted and untracked files. Walks the reverse import graph from each changed file
// and keeps the test files it reaches, each with the import path that reached it. Changed files
// no test reaches are listed as `untested` (source files only).
//
// Static imports only: a test that loads code at run time is missed. Use the list to run those
// tests FIRST, never instead of the full suite. Files committed after the codemap was written
// are added as changed too, so a stale map widens the list, never narrows it.
// From DeusData/codebase-memory-mcp "test impact" (read 2026-11-08).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_RE = [
  /(^|\/)(tests?|__tests__|specs?)\//i,
  /[._-](test|spec)s?\.[^/]+$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /Tests?\.cs$/,
];

export const isTest = (file) => TEST_RE.some((re) => re.test(file));

// Only source files can be `untested`; a changed README or config is not a gap.
const CODE_RE = /\.(m?[jt]sx?|cjs|py|cs|c|cc|cpp|cxx|h|hpp|go|rs|java|kt|swift|rb|php)$/i;

/** `## File deps` as a reverse map: target -> Set of files that import it. */
export function reverseDeps(codemapText) {
  const rev = new Map();
  const section = codemapText.split(/^## File deps\s*$/m)[1];
  if (!section) return rev;
  for (const line of section.split(/\r?\n/)) {
    if (/^## /.test(line)) break;
    const m = line.match(/^- `([^`]+)` → (.+)$/);
    if (!m) continue;
    for (const t of m[2].matchAll(/`([^`]+)`/g)) {
      if (!rev.has(t[1])) rev.set(t[1], new Set());
      rev.get(t[1]).add(m[1]);
    }
  }
  return rev;
}

/** Tests reached from `changed`: { tests: [{ file, via }], untested }. `via` runs from the changed file to the test. */
export function reach(rev, changed) {
  const tests = new Map();
  const untested = [];
  for (const start of changed) {
    if (isTest(start)) {
      if (!tests.has(start)) tests.set(start, [start]);
      continue;
    }
    const prev = new Map([[start, null]]);
    const queue = [start];
    let found = false;
    while (queue.length) {
      const cur = queue.shift();
      for (const dep of rev.get(cur) || []) {
        if (prev.has(dep)) continue;
        prev.set(dep, cur);
        if (isTest(dep)) {
          found = true;
          if (!tests.has(dep)) {
            const via = [dep];
            for (let p = cur; p; p = prev.get(p)) via.unshift(p);
            tests.set(dep, via);
          }
        }
        queue.push(dep); // keep going: a test helper is imported by the tests
      }
    }
    if (!found && CODE_RE.test(start)) untested.push(start);
  }
  return { tests: [...tests].map(([file, via]) => ({ file, via })).sort((a, b) => a.file.localeCompare(b.file)), untested };
}

function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/).filter(Boolean) : null;
}

function changedFiles(root, base) {
  const out = new Set();
  if (base) for (const f of git(root, 'diff', '--name-only', `${base}...HEAD`) || []) out.add(f);
  for (const f of git(root, 'diff', '--name-only', 'HEAD') || []) out.add(f);
  for (const f of git(root, 'ls-files', '--others', '--exclude-standard') || []) out.add(f);
  return out;
}

export function affectedTests({ root, codemap, base, files }) {
  const mapPath = resolve(root, codemap || join('.claude', 'codemap.md'));
  const changed = new Set(files && files.length ? files : changedFiles(root, base));
  if (!existsSync(mapPath)) {
    return { codemap: null, changed: [...changed].sort(), tests: [], untested: [], note: 'no codemap: run the full suite (/update-codemap writes one)' };
  }
  const since = Math.floor(statSync(mapPath).mtimeMs / 1000);
  const newer = (git(root, 'log', `--since=@${since}`, '--name-only', '--format=') || []).filter((f) => !changed.has(f));
  for (const f of newer) changed.add(f);
  const list = [...changed].filter((f) => !f.startsWith('.claude/')).sort();
  const r = reach(reverseDeps(readFileSync(mapPath, 'utf8')), list);
  const note = newer.length ? `${newer.length} file(s) committed after the codemap was written were added as changed` : '';
  return { codemap: mapPath, changed: list, ...r, note };
}

function main(argv) {
  const dash = argv.indexOf('--');
  const opts = dash === -1 ? argv : argv.slice(0, dash);
  const files = dash === -1 ? [] : argv.slice(dash + 1).map((f) => f.replace(/\\/g, '/'));
  const flag = (n) => { const i = opts.indexOf(n); return i === -1 ? undefined : opts[i + 1]; };
  const root = resolve(flag('--root') || process.cwd());
  console.log(JSON.stringify(affectedTests({ root, codemap: flag('--codemap'), base: flag('--base'), files }), null, 2));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/affected-tests.mjs')) main(process.argv.slice(2));
