// node --test skills/visualise-codemap/page-sources.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedLines, readDiff, readSources } from './page-sources.mjs';
import { pageData } from './map-page.mjs';

const hash = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);

test('changedLines: added, removed and new files in new-file line numbers', () => {
  const text = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -3 +3 @@ function a() {',
    '-  return 1;',
    '+  return 2;',
    '@@ -10,2 +9,0 @@',
    '-old one',
    '--- old two starts with dashes',
    'diff --git a/src/new.ts b/src/new.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/src/new.ts',
    '@@ -0,0 +1,2 @@',
    '+x',
    '+y',
    'diff --git a/src/gone.ts b/src/gone.ts',
    'deleted file mode 100644',
    '--- a/src/gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-z',
  ].join('\n');
  const d = changedLines(text);
  assert.deepEqual(d['src/a.ts'], { status: 'modified', add: [[3, 3]], del: [{ at: 3, lines: ['  return 1;'] }, { at: 10, lines: ['old one', '-- old two starts with dashes'] }] });
  assert.deepEqual(d['src/new.ts'], { status: 'added', add: [[1, 2]], del: [] });
  assert.deepEqual(d['src/gone.ts'], { status: 'deleted', add: [], del: [] });
});

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-src-'));
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  g('init', '-q');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(dir, 'src/b.ts'), 'bee\n');
  g('add', '.');
  g('commit', '-qm', 'base');
  fs.writeFileSync(path.join(dir, 'src/a.ts'), 'one\nTWO\nthree\nfour\n');
  fs.writeFileSync(path.join(dir, 'src/c.ts'), 'sea\nsea\n');
  return dir;
}

test('readDiff: working tree against a ref, untracked files count as added', () => {
  const dir = repo();
  const d = readDiff(dir, 'HEAD');
  assert.equal(d.ref, 'HEAD');
  assert.match(d.sha, /^[0-9a-f]{12}$/);
  assert.deepEqual(d.files['src/a.ts'], { status: 'modified', add: [[2, 2], [4, 4]], del: [{ at: 2, lines: ['two'] }] });
  assert.deepEqual(d.files['src/c.ts'], { status: 'added', add: [[1, 2]], del: [] });
  assert.equal(d.files['src/b.ts'], undefined);
  assert.throws(() => readDiff(dir, 'no-such-ref'), /not a commit/);
});

test('readSources: changed files first, budget respected, stale files marked', () => {
  const dir = repo();
  const json = { files: {
    'src/a.ts': { lang: 'ts', symbols: [{ name: 'a', line: 1 }], hash: hash('one\ntwo\nthree\n') },
    'src/b.ts': { lang: 'ts', symbols: [{ name: 'b', line: 1 }], hash: hash('bee\n'), importedBy: ['src/a.ts'] },
    'README.md': { lang: 'markdown', symbols: [{ name: 'x', line: 1 }] },
  } };
  const all = readSources(dir, json, { budget: 1e6 });
  assert.deepEqual(Object.keys(all.text), ['src/b.ts', 'src/a.ts'], 'most imported first; prose left out');
  assert.deepEqual(all.stale, ['src/a.ts']);
  const diff = readDiff(dir, 'HEAD');
  const small = readSources(dir, json, { budget: 20, diff });
  assert.deepEqual(Object.keys(small.text), ['src/a.ts'], 'changed file comes first and uses the budget');
  assert.deepEqual(small.left, ['src/b.ts']);
});

test('page data carries code, stale marks and the diff for files on the page', () => {
  const json = { files: { 'src/a.ts': { symbols: [{ name: 'a', kind: 'function', line: 1, endLine: 3 }] }, 'gen/x.ts': {} } };
  const isSkipped = (rel) => rel.startsWith('gen/');
  const sources = { text: { 'src/a.ts': 'x', 'gen/x.ts': 'y' }, stale: ['gen/x.ts'] };
  const diff = { ref: 'main', sha: 'abc', files: { 'src/a.ts': { status: 'modified', add: [[1, 1]], del: [] }, 'gen/x.ts': { status: 'modified', add: [], del: [] }, 'old.ts': { status: 'deleted', add: [], del: [] } } };
  const d = pageData(json, { isSkipped, sources, diff });
  assert.deepEqual(d.src, { 'src/a.ts': 'x' });
  assert.deepEqual(d.stale, []);
  assert.deepEqual(Object.keys(d.diff.files), ['src/a.ts', 'old.ts']);
  assert.equal(d.files['src/a.ts'].symbols[0].endLine, 3);
});

test('inlined code holding a template placeholder does not break the page', async () => {
  const { buildMapPage } = await import('./map-page.mjs');
  const json = { project: 'p', files: { 'a.mjs': { symbols: [{ name: 'a', line: 1 }] } } };
  const html = buildMapPage(json, { sources: { text: { 'a.mjs': "x.replace('{{ZOOM}}', z) // {{TITLE}}" }, stale: [] } });
  const data = html.match(/<script type="application\/json" id="data">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(data).src['a.mjs'], "x.replace('{{ZOOM}}', z) // {{TITLE}}");
  assert.match(html, /<title>p map<\/title>/);
});

test('readSources: tour stop files come before the most imported', () => {
  const dir = repo();
  const json = { files: {
    'src/a.ts': { lang: 'ts', symbols: [{ name: 'a', line: 1 }] },
    'src/b.ts': { lang: 'ts', symbols: [{ name: 'b', line: 1 }], importedBy: ['src/a.ts'] },
  } };
  assert.deepEqual(Object.keys(readSources(dir, json, { budget: 1e6, first: ['src/a.ts'] }).text), ['src/a.ts', 'src/b.ts']);
});

test('readDiff: works with diff.noprefix and on a map of a subfolder', () => {
  const dir = repo();
  execFileSync('git', ['-C', dir, 'config', 'diff.noprefix', 'true']);
  assert.deepEqual(readDiff(dir, 'HEAD').files['src/a.ts'].add, [[2, 2], [4, 4]]);
  const sub = readDiff(path.join(dir, 'src'), 'HEAD').files;
  assert.deepEqual(Object.keys(sub).sort(), ['a.ts', 'c.ts']);
});
