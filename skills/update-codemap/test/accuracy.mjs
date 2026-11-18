#!/usr/bin/env node
// Accuracy eval: runs the real codemap.mjs on each project in accuracy-fixtures.mjs and
// scores its codemap.json against the hand-written ground truth.
//
//   precision = found and right / found      recall = found and right / expected
//
// per category (imports, refs, calls, symbols) and fixture. Calls compare the callee's
// bare name (`Cart.Total` counts as `Total`). Symbols count as right when the line
// matches; symbol precision only looks at the expected names (a file's other symbols
// are not judged).
//
// Exit code is non-zero when any score drops below accuracy-baseline.json.
// --update-baseline records the current scores. --verbose lists each miss and extra.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCURACY_FIXTURES } from './accuracy-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODEMAP = path.join(HERE, '..', 'codemap.mjs');
const BASELINE = path.join(HERE, 'accuracy-baseline.json');
const CATEGORIES = ['imports', 'refs', 'calls', 'symbols'];
const UPDATE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function materialise(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codemap-acc-${fixture.name}-`));
  for (const [rel, text] of Object.entries(fixture.files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

// What codemap.json says, as sets of the same tuple keys the ground truth uses.
function actualOf(json) {
  const out = { imports: new Set(), refs: new Set(), calls: new Set(), symbols: new Map() };
  for (const [rel, f] of Object.entries(json.files)) {
    for (const t of f.imports || []) out.imports.add(`${rel} ${t}`);
    for (const t of f.refs || []) out.refs.add(`${rel} ${t}`);
    for (const s of f.symbols || []) {
      const key = `${rel} ${s.name}`;
      if (!out.symbols.has(key)) out.symbols.set(key, new Set());
      out.symbols.get(key).add(s.line);
    }
  }
  for (const c of json.calls || []) out.calls.add(`${c.file} ${c.caller} ${c.callee.split('.').pop()}`);
  return out;
}

function score(found, expected) {
  const right = [...found].filter((k) => expected.has(k)).length;
  return {
    precision: found.size ? right / found.size : 1,
    recall: expected.size ? right / expected.size : 1,
    extra: [...found].filter((k) => !expected.has(k)),
    missed: [...expected].filter((k) => !found.has(k)),
    n: expected.size,
  };
}

function evaluate(fixture) {
  const root = materialise(fixture);
  const r = spawnSync(process.execPath, [CODEMAP, '--root', root, '--quiet', '--no-cache'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${fixture.name}: codemap.mjs failed\n${r.stderr}`);
  const actual = actualOf(JSON.parse(fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8')));
  fs.rmSync(root, { recursive: true, force: true });
  const exp = fixture.expected;
  const result = {};
  for (const cat of ['imports', 'refs', 'calls']) {
    result[cat] = score(actual[cat], new Set(exp[cat].map((t) => t.join(' '))));
  }
  // Symbols: of the expected names codemap reports, how many sit on the right line.
  const expectedSymbols = new Set(exp.symbols.map(([f, n, l]) => `${f} ${n} ${l}`));
  const foundSymbols = new Set();
  for (const [f, n] of exp.symbols) {
    for (const line of actual.symbols.get(`${f} ${n}`) || []) foundSymbols.add(`${f} ${n} ${line}`);
  }
  result.symbols = score(foundSymbols, expectedSymbols);
  return result;
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(5);
const results = {};
for (const fixture of ACCURACY_FIXTURES) results[fixture.name] = evaluate(fixture);

console.log(`${'fixture'.padEnd(14)}${CATEGORIES.map((c) => `${c} P/R`.padEnd(16)).join('')}`);
for (const [name, r] of Object.entries(results)) {
  console.log(name.padEnd(14) + CATEGORIES.map((c) => (r[c].n ? `${pct(r[c].precision)} ${pct(r[c].recall)}` : '  n/a').padEnd(16)).join(''));
  if (VERBOSE) {
    for (const c of CATEGORIES) {
      for (const k of r[c].missed) console.log(`    missed ${c}: ${k}`);
      for (const k of r[c].extra) console.log(`    extra  ${c}: ${k}`);
    }
  }
}

const current = {};
for (const [name, r] of Object.entries(results)) {
  current[name] = {};
  for (const c of CATEGORIES) if (r[c].n) current[name][c] = { precision: +r[c].precision.toFixed(3), recall: +r[c].recall.toFixed(3) };
}

if (UPDATE) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`\nbaseline written: ${path.relative(process.cwd(), BASELINE)}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const drops = [];
for (const [name, cats] of Object.entries(baseline)) {
  for (const [c, b] of Object.entries(cats)) {
    const now = current[name] && current[name][c];
    for (const m of ['precision', 'recall']) {
      if (!now || now[m] + 0.0005 < b[m]) drops.push(`${name} ${c} ${m}: ${b[m]} -> ${now ? now[m] : 'missing'}`);
    }
  }
}
if (drops.length) {
  console.log(`\n${drops.length} score(s) dropped below the baseline:`);
  for (const d of drops) console.log(`  ${d}`);
  process.exit(1);
}
console.log('\nno score below the baseline.');
