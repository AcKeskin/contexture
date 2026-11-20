// node --test skills/execute/test/record-replay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, label } from '../record-replay.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'record-replay.mjs');

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'record-replay-test-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function cli(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('encode keeps -0, NaN, undefined, Infinity and sorts keys', () => {
  assert.deepEqual(encode([-0, NaN, undefined, -Infinity, { b: 1, a: 2 }]), [{ $: '-0' }, { $: 'NaN' }, { $: 'undefined' }, { $: '-Infinity' }, { a: 2, b: 1 }]);
  const cyc = { x: 1 };
  cyc.self = cyc;
  assert.deepEqual(encode(cyc), { self: { $: 'cycle' }, x: 1 });
  assert.equal(label('a'.repeat(10000)), '"a"×10000');
  assert.equal(label(-0), '-0');
});

test('JS: same behaviour replays SAME, changed behaviour shows the case', () => {
  const dir = project({ 'm.mjs': 'export function len(s) { return s.length; }\nexport const half = (n) => n / 2;\n' });
  const rec = cli(dir, 'record', 'm.mjs', '--fn', 'len,half');
  assert.equal(rec.code, 0, rec.out);
  assert.match(rec.out, /recorded len: 27 cases/);
  assert.ok(existsSync(join(dir, '.claude', 'replay', '.gitignore')));
  assert.equal(cli(dir, 'replay', 'm.mjs').code, 0);

  writeFileSync(join(dir, 'm.mjs'), 'export function len(s) { return [...s].length; }\nexport const half = (n) => n / 2;\n');
  const r = cli(dir, 'replay', 'm.mjs');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /CHANGED len/);
  assert.match(r.out, /len\("👍🏽"\)/);
  assert.match(r.out, /SAME half/);
});

test('JS: a thrown error is recorded and compared', () => {
  const dir = project({ 'e.cjs': 'exports.f = (x) => { if (x == null) throw new TypeError("no x"); return 1; };\n' });
  assert.equal(cli(dir, 'record', 'e.cjs', '--fn', 'f').code, 0);
  writeFileSync(join(dir, 'e.cjs'), 'exports.f = (x) => { if (x == null) throw new RangeError("no x"); return 1; };\n');
  const r = cli(dir, 'replay', 'e.cjs');
  assert.equal(r.code, 1);
  assert.match(r.out, /TypeError[\s\S]*RangeError/);
});

test('JS: unstable results are not compared; 3+ params need --seed', () => {
  const dir = project({ 'r.mjs': 'export const roll = () => Math.random();\nexport const add3 = (a, b, c) => a + b + c;\n' });
  const r = cli(dir, 'record', 'r.mjs', '--fn', 'roll');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 unstable/);
  assert.equal(cli(dir, 'replay', 'r.mjs').code, 0);
  const noSeed = cli(dir, 'record', 'r.mjs', '--fn', 'add3');
  assert.equal(noSeed.code, 2);
  assert.match(noSeed.out, /--seed/);
  const seeded = cli(dir, 'record', 'r.mjs', '--fn', 'add3', '--seed', '[1,2,3]');
  assert.equal(seeded.code, 0, seeded.out);
  assert.match(seeded.out, /recorded add3: 82 cases/);
});

test('JS: a module that keeps a timer alive still finishes', () => {
  const dir = project({ 't.mjs': 'setInterval(() => {}, 1000);\nexport const id = (x) => x;\n' });
  assert.equal(cli(dir, 'record', 't.mjs', '--fn', 'id').code, 0);
});

test('usage errors exit 2', () => {
  const dir = project({ 'a.ts': '', 'm.mjs': 'export const f = (x) => x;\n' });
  assert.equal(cli(dir, 'record', 'a.ts', '--fn', 'f').code, 2);
  assert.equal(cli(dir, 'record', 'm.mjs').code, 2);
  assert.equal(cli(dir, 'replay', 'm.mjs').code, 2);
  assert.equal(cli(dir, 'record', 'm.mjs', '--fn', 'nope').code, 2);
});

const hasPython = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['--version']).status === 0;

test('Python: annotations narrow the pool; a change is reported', { skip: !hasPython && 'no python' }, () => {
  const dir = project({ 'p.py': 'def initials(name: str) -> str:\n    return name[:1].upper()\n\ndef scale(x, k=2):\n    return x * k\n' });
  const rec = cli(dir, 'record', 'p.py', '--fn', 'initials,scale');
  assert.equal(rec.code, 0, rec.out);
  assert.match(rec.out, /recorded initials: 8 cases/);
  assert.match(rec.out, /recorded scale: 26 cases/);
  assert.equal(cli(dir, 'replay', 'p.py').code, 0);
  writeFileSync(join(dir, 'p.py'), 'def initials(name: str) -> str:\n    return name.strip()[:1].upper()\n\ndef scale(x, k=2):\n    return x * k\n');
  const r = cli(dir, 'replay', 'p.py');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /CHANGED initials: 1 of 8/);
  const saved = JSON.parse(readFileSync(join(dir, '.claude', 'replay', 'p.py.json'), 'utf8'));
  assert.equal(saved.lang, 'py');
});
