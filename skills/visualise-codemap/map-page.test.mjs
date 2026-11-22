// node --test skills/visualise-codemap/map-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapPage, pageData } from './map-page.mjs';

const json = {
  version: 1, project: 'demo', updated: '2026-11-22',
  entryPoints: [{ rel: 'src/main.ts', role: 'cli' }, { rel: 'vendor/x.js', role: 'lib' }],
  files: {
    'src/main.ts': { lang: 'ts', size: 10, lines: 20, hash: 'abc', purpose: 'Entry </script><!-- x', imports: ['src/lib/a.ts', 'vendor/x.js'],
      symbols: [{ name: 'main', kind: 'function', line: 3, endLine: 9, exported: true }] },
    'src/lib/a.ts': { lang: 'ts', size: 5, lines: 8, hash: 'def', importedBy: ['src/main.ts'] },
    'vendor/x.js': { lang: 'js', size: 1, lines: 1, hash: 'ghi', importedBy: ['src/main.ts'] },
  },
  modules: {}, classes: [], calls: [], callSequences: [],
};
const isSkipped = (rel) => rel.startsWith('vendor/');

test('pageData leaves out skipped files, their edges and fields the page never shows', () => {
  const d = pageData(json, { root: 'D:\\Dev\\demo', isSkipped });
  assert.deepEqual(Object.keys(d.files), ['src/main.ts', 'src/lib/a.ts']);
  assert.deepEqual(d.files['src/main.ts'].imports, ['src/lib/a.ts']);
  assert.equal(d.files['src/main.ts'].hash, undefined);
  assert.deepEqual(d.files['src/main.ts'].symbols, [{ name: 'main', kind: 'function', line: 3, endLine: 9 }]);
  assert.deepEqual(d.entryPoints, [{ rel: 'src/main.ts', role: 'cli' }]);
  assert.equal(d.root, 'D:/Dev/demo');
});

test('page is self-contained: data parses back, nothing can close the data script, zoom is inlined', () => {
  const html = buildMapPage(json, { root: '/home/u/demo', isSkipped }); // share-readiness: WONT_FIX — fake root for the test
  assert.ok(!/\{\{[A-Z]+\}\}/.test(html), 'placeholder left');
  const m = html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'data script');
  assert.equal(JSON.parse(m[1]).files['src/main.ts'].purpose, 'Entry </script><!-- x');
  assert.ok(!m[1].includes('</'));
  const zoom = readFileSync(new URL('../design-proposal/assets/zoom.js', import.meta.url), 'utf8');
  assert.ok(html.includes(zoom));
  assert.ok(html.includes('<title>demo map</title>'));
});
