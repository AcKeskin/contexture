import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { aliasCandidates, buildToSource, loadProjectPaths, parseJsonc } from '../project-paths.mjs';

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-paths-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return { root, files: Object.keys(files).map((rel) => ({ rel })) };
}

test('parseJsonc reads comments and trailing commas but keeps // inside strings', () => {
  const v = parseJsonc('{\n  // a comment\n  "url": "http://x/y", /* block */\n  "list": [1, 2,],\n}');
  assert.deepEqual(v, { url: 'http://x/y', list: [1, 2] });
  assert.equal(parseJsonc('{ nope'), null);
});

test('paths and baseUrl from the nearest tsconfig, following extends', () => {
  const { root, files } = project({
    'tsconfig.base.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@lib/*": ["packages/lib/src/*"] } } }',
    'apps/web/tsconfig.json': '{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" } }',
  });
  const pp = loadProjectPaths(root, files);
  assert.deepEqual(aliasCandidates('@lib/math', 'apps/web/src/a.ts', pp).slice(0, 2), ['packages/lib/src/math', '@lib/math']);
  assert.equal(buildToSource('apps/web/dist/x.js', pp), 'apps/web/src/x.js');
  assert.equal(buildToSource('apps/web/src/x.ts', pp), null);
});

test('a workspace package name resolves to its entry, mapped from build output to source', () => {
  const { root, files } = project({
    'packages/core/package.json': '{ "name": "@acme/core", "main": "build/index.js" }',
    'packages/core/tsconfig.json': '{ "compilerOptions": { "outDir": "./build", "rootDir": "./src" } }',
  });
  const pp = loadProjectPaths(root, files);
  const cands = aliasCandidates('@acme/core', 'apps/x.ts', pp);
  assert.ok(cands.includes('packages/core/src/index.js'));
  assert.ok(aliasCandidates('@acme/core/util', 'apps/x.ts', pp).includes('packages/core/src/util'));
  assert.deepEqual(aliasCandidates('react', 'apps/x.ts', pp), []);
});

test('parseJsonc reads a file with a BOM and keeps commas inside strings', () => {
  assert.deepEqual(parseJsonc('\uFEFF{ "a": 1, }'), { a: 1 });
  assert.deepEqual(parseJsonc('{ "s": "x,]", "t": [1,], }'), { s: 'x,]', t: [1] });
});
