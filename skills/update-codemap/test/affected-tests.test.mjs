import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isTest, reverseDeps, reach, affectedTests } from '../affected-tests.mjs';

const MAP = `# Architecture — demo

## File deps
- \`src/cart.js\` → \`src/money.js\`
- \`src/api.js\` → \`src/cart.js\`
- \`tests/helpers.js\` → \`src/api.js\`
- \`tests/api.test.js\` → \`tests/helpers.js\`
- \`src/cart.test.js\` → \`src/cart.js\`

## Class graph
- class: \`Cart\` in \`src/cart.js\`
`;

test('test file patterns', () => {
  for (const f of ['tests/a.js', 'src/__tests__/a.ts', 'a.test.ts', 'a_spec.rb', 'pkg/test_x.py', 'Game/PlayerTests.cs', 'x_test.go']) assert.ok(isTest(f), f);
  for (const f of ['src/latest.js', 'src/contest.py', 'Game/Player.cs', 'docs/testing.md']) assert.ok(!isTest(f), f);
});

test('reverse deps stop at the next section', () => {
  const rev = reverseDeps(MAP);
  assert.deepEqual([...rev.get('src/cart.js')].sort(), ['src/api.js', 'src/cart.test.js']);
  assert.equal(rev.has('Cart'), false);
});

test('reach follows helpers to the tests and keeps the path', () => {
  const r = reach(reverseDeps(MAP), ['src/money.js', 'src/orphan.js', 'README.md']);
  assert.deepEqual(r.tests.map((t) => t.file), ['src/cart.test.js', 'tests/api.test.js', 'tests/helpers.js']);
  assert.deepEqual(r.tests.find((t) => t.file === 'tests/api.test.js').via,
    ['src/money.js', 'src/cart.js', 'src/api.js', 'tests/helpers.js', 'tests/api.test.js']);
  assert.deepEqual(r.untested, ['src/orphan.js']);
});

test('a changed test is its own result', () => {
  assert.deepEqual(reach(new Map(), ['tests/x.test.js']).tests, [{ file: 'tests/x.test.js', via: ['tests/x.test.js'] }]);
});

const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' }); // share-readiness: WONT_FIX — fake identity for fixture commits

test('no codemap says run the full suite', () => {
  const root = mkdtempSync(join(tmpdir(), 'at-'));
  git(root, 'init', '-q');
  const r = affectedTests({ root, files: ['src/cart.js'] });
  assert.equal(r.codemap, null);
  assert.match(r.note, /full suite/);
});

test('files committed after the codemap widen the list', () => {
  const root = mkdtempSync(join(tmpdir(), 'at-'));
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, '.claude'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.claude', 'codemap.md'), MAP);
  const old = new Date(Date.now() - 3600 * 1000);
  utimesSync(join(root, '.claude', 'codemap.md'), old, old);
  writeFileSync(join(root, 'src', 'money.js'), 'x\n');
  git(root, 'add', 'src');
  git(root, 'commit', '-q', '-m', 'later');
  const r = affectedTests({ root, files: ['src/orphan.js'] });
  assert.ok(r.changed.includes('src/money.js'));
  assert.ok(r.tests.some((t) => t.file === 'src/cart.test.js'));
  assert.match(r.note, /1 file\(s\) committed after the codemap/);
});

test('CommonJS require() lands in File deps, so its tests are reached', () => {
  const root = mkdtempSync(join(tmpdir(), 'at-cjs-'));
  mkdirSync(join(root, 'lib'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'lib', 'io.js'), "'use strict';\nmodule.exports = { read() { return 1; } };\n");
  writeFileSync(join(root, 'tests', 'io.test.js'), "'use strict';\nconst io = require('../lib/io');\nconsole.log(io.read());\n");
  const codemap = join(dirname(fileURLToPath(import.meta.url)), '..', 'codemap.mjs');
  const run = spawnSync(process.execPath, [codemap, '--root', root, '--quiet', '--no-cache'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const r = affectedTests({ root, files: ['lib/io.js'] });
  assert.deepEqual(r.tests.map((t) => t.file), ['tests/io.test.js']);
  assert.deepEqual(r.untested, []);
});
