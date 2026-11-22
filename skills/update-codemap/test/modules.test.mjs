import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectModuleRoots, makeModuleOf, dirPatternRegex } from '../modules.mjs';

const files = (list) => list.map((rel) => ({ rel }));

test('a folder with its own manifest is a module; the deepest wins', () => {
  const roots = detectModuleRoots(files([
    'mcps/README.md',
    'mcps/unity/server/package.json', 'mcps/unity/server/src/index.ts',
    'mcps/unity/pkg/package.json', 'mcps/unity/pkg/Editor/Ed.asmdef', 'mcps/unity/pkg/Editor/A.cs',
    'mcps/lib-py/pyproject.toml', 'mcps/lib-py/x.py',
    'src/main.ts',
  ]));
  const moduleOf = makeModuleOf(roots);
  assert.equal(moduleOf('mcps/unity/server/src/index.ts'), 'mcps/unity/server/');
  assert.equal(moduleOf('mcps/unity/pkg/Editor/A.cs'), 'mcps/unity/pkg/Editor/');
  assert.equal(moduleOf('mcps/lib-py/x.py'), 'mcps/lib-py/');
  assert.equal(moduleOf('mcps/README.md'), 'mcps/');
  assert.equal(moduleOf('src/main.ts'), 'src/');
  assert.equal(moduleOf('README.md'), './');
  assert.equal(roots.find((r) => r.dir === 'mcps/unity/server/').manifest, 'mcps/unity/server/package.json');
});

test('manifests in test data, and folders with one file, are not modules', () => {
  const roots = detectModuleRoots(files([
    'src/__tests__/fixtures/app/package.json', 'src/__tests__/fixtures/app/index.js',
    'tools/lonely/package.json',
  ]));
  assert.deepEqual(roots, []);
});

test('a folder crowded with sub-projects becomes one module that lists them', () => {
  const list = [];
  for (let i = 0; i < 14; i++) list.push(`playground/app${i}/package.json`, `playground/app${i}/main.js`);
  list.push('packages/core/package.json', 'packages/core/index.js');
  const roots = detectModuleRoots(files(list));
  const play = roots.find((r) => r.dir === 'playground/');
  assert.equal(play.projects.length, 14);
  assert.equal(makeModuleOf(roots)('playground/app3/main.js'), 'playground/');
  assert.equal(makeModuleOf(roots)('packages/core/index.js'), 'packages/core/');
});

test('## Modules patterns and depth replace detection', () => {
  const list = files(['packages/a/x.ts', 'packages/b/y.ts', 'apps/web/package.json', 'apps/web/z.ts', 'skills/review/SKILL.md', 'skills/README.md']);
  const byPattern = makeModuleOf(detectModuleRoots(list, { depth: 0, patterns: ['packages/*'] }));
  assert.equal(byPattern('packages/a/x.ts'), 'packages/a/');
  assert.equal(byPattern('apps/web/z.ts'), 'apps/'); // detection is off
  const byDepth = makeModuleOf(detectModuleRoots(list, { depth: 2, patterns: [] }));
  assert.equal(byDepth('skills/review/SKILL.md'), 'skills/review/');
  assert.equal(byDepth('skills/README.md'), 'skills/');
});

test('folder patterns match whole folder paths', () => {
  assert.ok(dirPatternRegex('packages/*').test('packages/a'));
  assert.ok(!dirPatternRegex('packages/*').test('packages/a/b'));
  assert.ok(dirPatternRegex('apps/**/svc').test('apps/x/y/svc'));
  assert.ok(dirPatternRegex('/libs/*/').test('libs/q'));
});
