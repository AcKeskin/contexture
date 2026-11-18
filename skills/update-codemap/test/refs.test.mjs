import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractRefs, resolveRef } from '../refs.mjs';

const INDEX = new Set(['docs/guide.md', 'skills/a/spec.md', 'hooks/x.js', 'README.md', 'src/b.ts']);

test('markdown links and path spans, relative to the file then to the repo root', () => {
  const md = 'See [spec](spec.md#top), [home](https://x.io/a.md), [up](../../README.md) and `hooks/x.js`.\n[ref]: ./spec.md\n`npm test` `a/b`';
  const refs = extractRefs(md, 'skills/a/SKILL.md');
  assert.deepEqual(refs.map((r) => resolveRef(r, 'skills/a/SKILL.md', INDEX)).filter(Boolean).sort(),
    ['README.md', 'hooks/x.js', 'skills/a/spec.md', 'skills/a/spec.md']);
});

test('config paths with a ${VAR}/ root resolve from the repo root', () => {
  const json = '{ "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/x.js --flag", "doc": "docs/guide.md", "other": "v1.2" }';
  const refs = extractRefs(json, 'hooks/hooks.json');
  assert.deepEqual(refs.map((r) => resolveRef(r, 'hooks/hooks.json', INDEX)).filter(Boolean).sort(), ['docs/guide.md', 'hooks/x.js']);
});

test('code files have no refs, and unknown or self paths resolve to nothing', () => {
  assert.deepEqual(extractRefs("import './b'", 'src/a.ts'), []);
  assert.equal(resolveRef('missing.md', 'docs/guide.md', INDEX), null);
  assert.equal(resolveRef('guide.md', 'docs/guide.md', INDEX), null);
  assert.equal(resolveRef('mailto:a@b.c', 'docs/guide.md', INDEX), null);
});
