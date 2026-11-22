// node --test skills/visualise-codemap/components.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assign, check, componentMermaid, prompt } from './components.mjs';
import { pageData } from './map-page.mjs';

const json = {
  project: 'demo',
  files: {
    'src/api/routes.ts': { lines: 10, purpose: 'HTTP routes', imports: ['src/db/pool.ts'], importedBy: [] },
    'src/api/auth/login.ts': { lines: 5, imports: ['src/db/pool.ts'] },
    'src/db/pool.ts': { lines: 8, purpose: 'Connection pool', importedBy: ['src/api/routes.ts', 'src/api/auth/login.ts'] },
    'docs/guide.md': { lines: 3, refs: ['src/api/routes.ts'] },
    'README.md': { lines: 1 },
    'vendor/x.js': { lines: 1, vendored: true },
  },
};
const doc = {
  version: 1,
  components: [
    { id: 'web', name: 'Web API', layer: 'api', paths: ['src/api/'] },
    { id: 'auth', name: 'Auth', layer: 'service', paths: ['src/api/auth/'] },
    { id: 'store', name: 'Storage', layer: 'data', paths: ['src/db/', './'] },
  ],
  links: [{ from: 'web', to: 'store', label: 'reads and writes' }],
};

test('assign: longest path wins, "./" takes root files, the rest goes to other', () => {
  const { byFile, unusedPaths } = assign(doc, Object.keys(json.files));
  assert.equal(byFile.get('src/api/routes.ts'), 'web');
  assert.equal(byFile.get('src/api/auth/login.ts'), 'auth');
  assert.equal(byFile.get('README.md'), 'store');
  assert.equal(byFile.get('docs/guide.md'), 'other');
  assert.deepEqual(unusedPaths, []);
});

test('check reports bad layers, unknown links and dead paths', () => {
  const bad = { components: [{ id: 'a', name: 'A', layer: 'magic', paths: ['nope/'] }], links: [{ from: 'a', to: 'b', label: 'x' }] };
  const r = check(bad, json);
  assert.ok(r.problems.some((p) => p.includes('layer "magic"')));
  assert.ok(r.problems.some((p) => p.includes('link a -> b')));
  assert.ok(r.problems.some((p) => p.includes('path matches no file: nope/')));
  assert.deepEqual(check(doc, json).problems, []);
  assert.deepEqual(check(doc, json).other, ['docs/guide.md']);
});

test('componentMermaid labels named links and draws reference-only links dashed', () => {
  const m = componentMermaid(json, doc);
  assert.match(m, /c_web -->\|"reads and writes"\| c_store/);
  assert.match(m, /c_auth -->\|"1"\| c_store/);
  assert.ok(!m.includes('refs 1'), 'weak reference-only links are left out');
  const named = componentMermaid(json, { ...doc, links: [...doc.links, { from: 'other', to: 'web', label: 'documents' }] });
  assert.match(named, /c_other -\.->\|"documents"\| c_web/);
  assert.match(m, /classDef api /);
});

test('prompt lists folders with purposes and folder links', () => {
  const p = prompt(json);
  assert.match(p, /- src\/api\/ \(1 files, 10 lines\)\n {4}routes\.ts: HTTP routes/);
  assert.match(p, /src\/api\/auth\/ -> src\/db\/ \(1\)/);
  assert.ok(!p.includes('vendor/'));
});

test('page data carries each file\'s component and the named links', () => {
  const d = pageData(json, { components: doc });
  assert.equal(d.files['src/api/auth/login.ts'].c, 'auth');
  assert.deepEqual(d.components.map((c) => c.id), ['web', 'auth', 'store', 'other']);
  assert.deepEqual(d.links, [{ from: 'web', to: 'store', label: 'reads and writes' }]);
  assert.equal(pageData(json).components, undefined);
});

test('readComponents accepts a file with a BOM', async () => {
  const { readComponents } = await import('./components.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'comp-'));
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'codemap.components.json'), '\uFEFF{"version":1,"components":[]}');
  assert.deepEqual(readComponents(dir), { version: 1, components: [] });
});
