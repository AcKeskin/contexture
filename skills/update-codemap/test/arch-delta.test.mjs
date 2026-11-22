// node --test skills/update-codemap/test/arch-delta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compare, forReview, groupOf, mermaid, summary } from '../arch-delta.mjs';

const f = (hash, imports = [], symbols = []) => ({ hash, imports, symbols });
const oldJ = { files: {
  'src/api/routes.ts': f('a1', ['src/db/pool.ts']),
  'src/db/pool.ts': f('b1', [], [{ name: 'query', kind: 'function', exported: true, signature: '(sql: string)' }]),
  'src/legacy/old.ts': f('c1', ['src/db/pool.ts']),
  'README.md': f('d1'),
} };
const newJ = { files: {
  'src/api/routes.ts': f('a2', ['src/db/pool.ts', 'src/auth/token.ts']),
  'src/db/pool.ts': f('b2', ['src/api/routes.ts'], [{ name: 'query', kind: 'function', exported: true, signature: '(sql: string, args: unknown[])' }]),
  'src/auth/token.ts': f('e1', [], [{ name: 'sign', kind: 'function', exported: true }]),
  'README.md': f('d1'),
} };

test('groupOf: folder two levels deep, shallower files keep their own folder', () => {
  assert.equal(groupOf('src/api/v1/x.ts'), 'src/api/');
  assert.equal(groupOf('hooks/a.js'), 'hooks/');
  assert.equal(groupOf('README.md'), './');
  assert.equal(groupOf('src/api/v1/x.ts', 3), 'src/api/v1/');
});

test('compare finds files, folders, links, cycles and export changes', () => {
  const d = compare(oldJ, newJ);
  assert.deepEqual(d.files, { added: ['src/auth/token.ts'], removed: ['src/legacy/old.ts'], changed: ['src/api/routes.ts', 'src/db/pool.ts'] });
  assert.deepEqual(d.groups, { added: ['src/auth/'], removed: ['src/legacy/'] });
  assert.deepEqual(d.edges, [
    { from: 'src/api/', to: 'src/auth/', before: 0, after: 1 },
    { from: 'src/db/', to: 'src/api/', before: 0, after: 1 },
    { from: 'src/legacy/', to: 'src/db/', before: 1, after: 0 },
  ]);
  assert.deepEqual(d.cycles.added, [['src/api/', 'src/db/']]);
  assert.deepEqual(d.surface.added, [{ file: 'src/auth/token.ts', name: 'sign', signature: undefined, line: undefined, endLine: undefined }]);
  assert.equal(d.surface.changed[0].before, '(sql: string)');
  assert.equal(summary(d), '2 new folder links, 1 removed, 1 new folder, 1 folder gone, 1 new cycle, exports +1 / ~1 / -0.');
});

test('mermaid colours new and removed links; no change gives no diagram', () => {
  const m = mermaid(compare(oldJ, newJ));
  assert.match(m, /g_src_api_ -->\|"new 1"\| g_src_auth_/);
  assert.match(m, /g_src_legacy_ -\.->\|"gone 1"\| g_src_db_/);
  assert.match(m, /g_src_auth_\["src\/auth\/"\]:::added/);
  assert.equal(mermaid(compare(oldJ, oldJ)), null);
  assert.match(summary(compare(oldJ, oldJ)), /no new or removed folder links/);
});

test('review page and note show the architecture change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-'));
  try {
    const review = fileURLToPath(new URL('../../review/', import.meta.url));
    const findings = JSON.parse(readFileSync(join(review, 'assets', 'example-findings.json'), 'utf8'));
    findings.architecture = forReview(compare(oldJ, newJ), { base: 'origin/main', head: 'abc123' });
    const input = join(dir, 'f.json');
    writeFileSync(input, JSON.stringify(findings));
    const page = join(dir, 'f.html');
    execFileSync(process.execPath, [join(review, 'render-page.mjs'), input, page]);
    const html = readFileSync(page, 'utf8');
    assert.ok(html.includes('<h3>Architecture change</h3>'));
    assert.ok(html.includes('New cycle <code>src/api/</code> ↔ <code>src/db/</code>'));
    const note = join(dir, 'f.md');
    execFileSync(process.execPath, [join(review, 'render-note.mjs'), input, note]);
    const md = readFileSync(note, 'utf8');
    assert.ok(md.includes('## Architecture change'));
    assert.ok(md.includes('- `src/legacy/` → `src/db/` removed (was 1)'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('addCode: changed exports as a line diff, added and removed as their declaration line', async () => {
  const { addCode, compare } = await import('../arch-delta.mjs');
  const sym = (name, line, endLine, signature) => ({ name, kind: 'function', exported: true, line, endLine, signature });
  const oldJ = { files: { 'a.ts': { hash: '1', symbols: [sym('run', 2, 4, '(x)'), sym('gone', 6, 6, '()')] } } };
  const newJ = { files: { 'a.ts': { hash: '2', symbols: [sym('run', 2, 4, '(x, y)'), sym('fresh', 6, 7, '()')] } } };
  const text = {
    base: 'import a\nfunction run(x) {\n  return x;\n}\n\nfunction gone() {}\n',
    head: 'import a\nfunction run(x, y) {\n  return x;\n}\n\nfunction fresh() {\n}\n',
  };
  const d = addCode(compare(oldJ, newJ), (side, files) => new Map(files.map((f) => [f, text[side]])));
  assert.deepEqual(d.surface.changed[0].code, [
    { t: 'function run(x) {', c: 'del' }, { t: 'function run(x, y) {', c: 'add' }, { t: '  return x;', c: '' }, { t: '}', c: '' },
  ]);
  assert.deepEqual(d.surface.added[0].code, [{ t: 'function fresh() {', c: 'add' }]);
  assert.deepEqual(d.surface.removed[0].code, [{ t: 'function gone() {}', c: 'del' }]);
});

test('addCode: an export with no signature counts as changed when its declaration line changed', async () => {
  const { addCode, compare, forReview } = await import('../arch-delta.mjs');
  const sym = (name, line, endLine) => ({ name, kind: 'function', exported: true, line, endLine });
  const oldJ = { files: { 'a.ts': { hash: '1', symbols: [sym('q', 1, 3), sym('same', 5, 5)] } } };
  const newJ = { files: { 'a.ts': { hash: '2', symbols: [sym('q', 1, 3), sym('same', 5, 5)] } } };
  const text = { base: 'export function q(a) {\n  return a;\n}\n\nexport const same = 1;\n', head: 'export function q(a, b) {\n  return a;\n}\n\nexport const same = 1;\n' };
  const d = addCode(compare(oldJ, newJ), (side, files) => new Map(files.map((f) => [f, text[side]])));
  assert.equal(d.surface.changed.length, 1);
  assert.equal(d.surface.changed[0].before, 'export function q(a)');
  assert.equal(d.surface.changed[0].signature, 'export function q(a, b)');
  assert.equal(d.surface.kept, undefined);
  assert.deepEqual(Object.keys(forReview(compare(oldJ, newJ)).surface), ['added', 'removed', 'changed']);
});

test('CLI: compares from the merge base, fires no git hook, leaves no worktree, skips doc-only changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-cli-'));
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  const cli = (...a) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('../arch-delta.mjs', import.meta.url)), '--root', dir, ...a], { encoding: 'utf8' }));
  try {
    g('init', '-q', '-b', 'main');
    execFileSync('mkdir', ['-p', join(dir, 'src/api'), join(dir, 'src/db'), join(dir, '.git/hooks')]);
    writeFileSync(join(dir, '.git/hooks/post-checkout'), `#!/bin/sh\ntouch "${join(dir, 'HOOK_RAN')}"\n`, { mode: 0o755 });
    writeFileSync(join(dir, 'src/db/pool.ts'), 'export function query(sql) {\n  return sql;\n}\n');
    writeFileSync(join(dir, 'src/api/routes.ts'), 'export function list() {\n  return 1;\n}\n');
    g('add', '.'); g('commit', '-qm', 'base');
    g('checkout', '-qb', 'feature');
    writeFileSync(join(dir, 'src/api/routes.ts'), 'import { query } from "../db/pool";\nexport function list() {\n  return query("x");\n}\n');
    g('commit', '-qam', 'api uses db');
    g('checkout', '-q', 'main');
    writeFileSync(join(dir, 'src/db/extra.ts'), 'export function extra() {}\n');
    g('add', '.'); g('commit', '-qm', 'main moves on');
    rmSync(join(dir, 'HOOK_RAN'), { force: true });
    const a = cli('--base', 'main', '--head', 'feature');
    assert.deepEqual(a.edges, [{ from: 'src/api/', to: 'src/db/', before: 0, after: 1 }]);
    assert.deepEqual(a.surface.removed, [], 'main\'s new export is not counted as removed');
    assert.throws(() => readFileSync(join(dir, 'HOOK_RAN')), 'post-checkout did not run');
    assert.equal(g('worktree', 'list').trim().split('\n').length, 1);
    g('checkout', '-q', 'feature');
    writeFileSync(join(dir, 'README.md'), 'docs\n'); g('add', '.'); g('commit', '-qm', 'docs');
    assert.equal(cli('--base', 'HEAD~1').summary, 'no code files changed.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readAt: many files at a commit in one call, missing ones left out', async () => {
  const { readAt } = await import('../arch-delta.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'arch-read-'));
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  try {
    g('init', '-q');
    writeFileSync(join(dir, 'a.ts'), 'é one\ntwo\n'); writeFileSync(join(dir, 'b.ts'), '');
    g('add', '.'); g('commit', '-qm', 'x');
    const m = readAt(dir, 'HEAD', ['a.ts', 'gone.ts', 'b.ts']);
    assert.deepEqual([...m], [['a.ts', 'é one\ntwo\n'], ['b.ts', '']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
