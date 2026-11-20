#!/usr/bin/env node
// Record what pure functions return before a refactor, replay after, show what changed.
//
//   node record-replay.mjs record <file> --fn a,b [--seed '[1,"x",true]'] [--cases cases.json]
//   node record-replay.mjs replay <file>
//
// JS (.js .mjs .cjs) and Python (.py). Inputs come from the type-trap pool in
// ../write-tests/input-traps.md: every pool value per position for up to 2
// parameters; with 3+ parameters, one position at a time around --seed.
// --cases adds argument lists of your own (a JSON array of arrays).
// Each case runs twice at record time; a case whose result differs is marked
// unstable and not compared. Recordings go to .claude/replay/ (git-ignored).
// Exit: 0 same, 1 something changed, 2 usage or run error.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_TIMEOUT_MS = 120000;
const MAX_SHOWN = 20;
const LONG = 10000;

// ---- JS runner: generate cases, call, encode ------------------------------

const POOL = () => [
  '', ' ', 'Größe', '👍🏽', 'é', 'a'.repeat(LONG), 'ABC', 'abc',
  0, -0, -1, 1, 2.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER,
  null, undefined, true, false,
  [], [1], [1, 1], [3, 1, 2], {}, { a: 1 },
];

function label(v) {
  if (typeof v === 'string') return v.length > 40 ? `"${v[0]}"×${v.length}` : JSON.stringify(v);
  if (Object.is(v, -0)) return '-0';
  if (typeof v === 'number' || v === undefined || typeof v === 'bigint') return String(v);
  if (typeof v === 'function') return 'fn';
  try {
    return JSON.stringify(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

function encode(v, seen = new Set()) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $: 'NaN' };
    if (Object.is(v, -0)) return { $: '-0' };
    if (!Number.isFinite(v)) return { $: v > 0 ? 'Infinity' : '-Infinity' };
    return v;
  }
  if (v === undefined) return { $: 'undefined' };
  if (typeof v === 'bigint') return { $: 'bigint', v: String(v) };
  if (typeof v === 'function') return { $: 'function' };
  if (typeof v === 'symbol') return { $: 'symbol', v: String(v) };
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return { $: 'cycle' };
  seen.add(v);
  try {
    if (Array.isArray(v)) return v.map((x) => encode(x, seen));
    if (v instanceof Date) return { $: 'Date', v: Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString() };
    if (v instanceof Map) return { $: 'Map', v: [...v].map(([k, x]) => [encode(k, seen), encode(x, seen)]) };
    if (v instanceof Set) return { $: 'Set', v: [...v].map((x) => encode(x, seen)) };
    if (v instanceof Error) return { $: 'Error', name: v.name, message: v.message };
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = encode(v[k], seen);
    return out;
  } finally {
    seen.delete(v);
  }
}

function jsCases(arity, seed, extra) {
  const cases = [];
  if (arity === 0) cases.push(() => []);
  else if (arity <= 2) {
    const n = POOL().length;
    for (let i = 0; i < n; i++) {
      if (arity === 1) cases.push(() => [POOL()[i]]);
      else for (let j = 0; j < n; j++) cases.push(() => [POOL()[i], POOL()[j]]);
    }
  } else if (seed) {
    cases.push(() => structuredClone(seed));
    for (let p = 0; p < arity; p++) {
      for (let i = 0; i < POOL().length; i++) {
        cases.push(() => {
          const args = structuredClone(seed);
          args[p] = POOL()[i];
          return args;
        });
      }
    }
  }
  for (const args of extra) cases.push(() => structuredClone(args));
  return cases;
}

async function callOnce(fn, args) {
  try {
    const r = fn(...args);
    if (r && typeof r.then === 'function') {
      try {
        return { resolves: encode(await r) };
      } catch (e) {
        return { rejects: errorOf(e) };
      }
    }
    return { returns: encode(r) };
  } catch (e) {
    return { throws: errorOf(e) };
  }
}

function errorOf(e) {
  return e instanceof Error ? { name: e.name, message: e.message } : { value: encode(e) };
}

async function runJs(file, names, seed, extra) {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const out = {};
  for (const name of names) {
    const fn = typeof mod[name] === 'function' ? mod[name] : mod.default && mod.default[name];
    if (typeof fn !== 'function') {
      out[name] = { error: `no exported function "${name}"` };
      continue;
    }
    if (fn.length > 2 && !seed) {
      out[name] = { error: `${name} takes ${fn.length} parameters: pass --seed with typical arguments` };
      continue;
    }
    const results = [];
    for (const make of jsCases(fn.length, seed, extra)) {
      const args = make();
      const lbl = `(${args.map(label).join(', ')})`;
      const a = await callOnce(fn, make());
      const b = await callOnce(fn, make());
      const same = JSON.stringify(a) === JSON.stringify(b);
      results.push(same ? { label: lbl, out: a } : { label: lbl, unstable: true });
    }
    out[name] = { arity: fn.length, results };
  }
  return out;
}

// ---- CLI -------------------------------------------------------------------

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: record-replay.mjs record <file> --fn a,b [--seed JSON] [--cases file.json]\n       record-replay.mjs replay <file>');
  return 2;
}

function parseArgs(argv) {
  const [cmd, file, ...rest] = argv;
  const opts = { cmd, file };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === '--fn') opts.fn = rest[++i];
    else if (k === '--seed') opts.seed = rest[++i];
    else if (k === '--cases') opts.cases = rest[++i];
    else opts.bad = k;
  }
  return opts;
}

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function recordingPath(file) {
  const rel = relative(projectRoot(), resolve(file)).replace(/[\\/:]/g, '__');
  return join(projectRoot(), '.claude', 'replay', `${rel}.json`);
}

function langOf(file) {
  const ext = extname(file).toLowerCase();
  if (['.js', '.mjs', '.cjs'].includes(ext)) return 'js';
  if (ext === '.py') return 'py';
  return null;
}

// Run the target in a child process so a hang or a crash cannot take this one down.
function runTarget(lang, file, names, seed, extra) {
  const dir = mkdtempSync(join(tmpdir(), 'record-replay-'));
  const spec = join(dir, 'spec.json');
  const result = join(dir, 'result.json');
  writeFileSync(spec, JSON.stringify({ file: resolve(file), names, seed, extra }));
  try {
    const cmd = lang === 'js' ? process.execPath : process.platform === 'win32' ? 'python' : 'python3';
    const script = lang === 'js' ? fileURLToPath(import.meta.url) : join(HERE, 'record-replay.py');
    const args = lang === 'js' ? [script, '_run', spec, result] : [script, spec, result];
    const r = spawnSync(cmd, args, { cwd: projectRoot(), encoding: 'utf8', timeout: RUN_TIMEOUT_MS });
    if (r.error) throw new Error(r.error.code === 'ETIMEDOUT' ? `timed out after ${RUN_TIMEOUT_MS / 1000}s (a function may loop)` : r.error.message);
    if (!existsSync(result)) throw new Error(`runner failed (exit ${r.status}): ${(r.stderr || '').trim().split('\n').slice(-5).join('\n')}`);
    return JSON.parse(readFileSync(result, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ensureReplayDir(dir) {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), '*\n');
}

function record(opts, lang) {
  if (!opts.fn) return usage('record needs --fn with the pure functions to record');
  const names = opts.fn.split(',').map((s) => s.trim()).filter(Boolean);
  const seed = opts.seed ? JSON.parse(opts.seed) : null;
  if (seed && !Array.isArray(seed)) return usage('--seed must be a JSON array of arguments');
  const extra = opts.cases ? JSON.parse(readFileSync(opts.cases, 'utf8')) : [];
  if (!Array.isArray(extra) || !extra.every(Array.isArray)) return usage('--cases must hold a JSON array of argument arrays');
  const functions = runTarget(lang, opts.file, names, seed, extra);
  const errors = Object.entries(functions).filter(([, f]) => f.error);
  for (const [, f] of errors) console.error(f.error);
  if (errors.length) return 2;
  const out = recordingPath(opts.file);
  ensureReplayDir(dirname(out));
  writeFileSync(out, JSON.stringify({ version: 1, file: relative(projectRoot(), resolve(opts.file)), lang, seed, extra, functions }, null, 1) + '\n');
  for (const [name, f] of Object.entries(functions)) {
    const unstable = f.results.filter((r) => r.unstable).length;
    console.log(`recorded ${name}: ${f.results.length} cases${unstable ? `, ${unstable} unstable (not compared)` : ''}`);
  }
  console.log(`saved ${relative(projectRoot(), out)}`);
  return 0;
}

const show = (o) => {
  const s = JSON.stringify(o);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

function replay(opts, lang) {
  const file = recordingPath(opts.file);
  if (!existsSync(file)) return usage(`no recording for ${opts.file}; run record first`);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const now = runTarget(lang, opts.file, Object.keys(saved.functions), saved.seed, saved.extra || []);
  let changed = 0;
  for (const [name, before] of Object.entries(saved.functions)) {
    const after = now[name];
    if (after.error) {
      console.log(`CHANGED ${name}: ${after.error}`);
      changed++;
      continue;
    }
    const afterByLabel = new Map(after.results.map((r) => [r.label, r]));
    const diffs = [];
    let compared = 0;
    let missing = 0;
    for (const b of before.results) {
      const a = afterByLabel.get(b.label);
      if (!a) {
        missing++;
        continue;
      }
      if (b.unstable || a.unstable) continue;
      compared++;
      if (JSON.stringify(a.out) !== JSON.stringify(b.out)) diffs.push(`  ${name}${b.label}\n    before ${show(b.out)}\n    after  ${show(a.out)}`);
    }
    const note = missing ? `; ${missing} cases not compared (parameters changed: ${before.arity} -> ${after.arity})` : '';
    if (diffs.length) {
      changed++;
      console.log(`CHANGED ${name}: ${diffs.length} of ${compared} cases differ${note}`);
      console.log(diffs.slice(0, MAX_SHOWN).join('\n'));
      if (diffs.length > MAX_SHOWN) console.log(`  ... ${diffs.length - MAX_SHOWN} more`);
    } else {
      if (missing) changed++;
      console.log(`${missing ? 'CHANGED' : 'SAME'} ${name}: ${compared} cases match${note}`);
    }
  }
  return changed ? 1 : 0;
}

async function main(argv) {
  if (argv[0] === '_run') {
    const spec = JSON.parse(readFileSync(argv[1], 'utf8'));
    writeFileSync(argv[2], JSON.stringify(await runJs(spec.file, spec.names, spec.seed, spec.extra)));
    return 0;
  }
  const opts = parseArgs(argv);
  if (opts.bad) return usage(`unknown option ${opts.bad}`);
  if (!['record', 'replay'].includes(opts.cmd) || !opts.file) return usage();
  if (!existsSync(opts.file)) return usage(`no such file: ${opts.file}`);
  const lang = langOf(opts.file);
  if (!lang) return usage(`${basename(opts.file)}: only .js, .mjs, .cjs and .py are supported`);
  try {
    return opts.cmd === 'record' ? record(opts, lang) : replay(opts, lang);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
// Exit explicitly: a target module's timers must not keep the runner alive.
if (isMain) process.exit(await main(process.argv.slice(2)));

export { encode, label, jsCases };
