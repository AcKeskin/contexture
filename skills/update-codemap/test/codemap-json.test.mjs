// codemap.json (spec §9), the size cap (§6a) and the unchanged-write path (§7),
// end to end on a small fixture project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', 'codemap.mjs');
const HAS_AST = fs.existsSync(path.join(HERE, '..', 'node_modules', 'web-tree-sitter'));

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-json-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

function run(root, ...args) {
  const r = spawnSync(process.execPath, [ENGINE, '--root', root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const FILES = {
  'src/util.ts': '// Math helpers\n\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport class Counter {\n  count = 0;\n}\n',
  'src/main.ts': "// Entry\nimport { add } from './util';\n\nexport function main(): number {\n  return add(1, 2);\n}\n",
  'test/util.test.ts': "import { add } from '../src/util';\nadd(1, 1);\n",
};

test('codemap.json lists symbols with lines, importers and the tests that reach a file', () => {
  const root = project(FILES);
  run(root);
  const json = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8'));
  const util = json.files['src/util.ts'];
  assert.equal(util.lang, 'ts');
  assert.equal(util.lines, 9);
  assert.match(util.hash, /^[0-9a-f]{16}$/);
  assert.equal(util.purpose, 'Math helpers');
  const add = util.symbols.find((s) => s.name === 'add');
  assert.equal(add.line, 3);
  assert.equal(add.exported, true);
  assert.equal(util.symbols.find((s) => s.name === 'Counter').line, 7);
  assert.deepEqual(util.importedBy, ['src/main.ts', 'test/util.test.ts']);
  assert.deepEqual(util.tests, ['test/util.test.ts']);
  assert.deepEqual(json.files['src/main.ts'].imports, ['src/util.ts']);
  assert.equal(json.files['test/util.test.ts'].isTest, true);
  if (HAS_AST) {
    assert.equal(add.endLine, 5);
    assert.ok(json.calls.some((c) => c.file === 'src/main.ts' && c.caller === 'main' && c.callee === 'add'));
  }
});

// Tokens (chars / 4) of the uncapped codemap.md without the given sections.
function fixedTokens(root, headings) {
  run(root, '--map-tokens', '0');
  const md = fs.readFileSync(path.join(root, '.claude', 'codemap.md'), 'utf8');
  const kept = md.split(/\n(?=## )/).filter((p) => !headings.some((h) => p.startsWith(h + '\n')));
  return Math.ceil(kept.reduce((n, p) => n + p.length + 1, 0) / 4);
}

test('the size cap trims the class graph first and says so', () => {
  const root = project(FILES);
  const budget = fixedTokens(root, ['## Class graph', '## Call sequence', '## Symbol index']);
  const out = run(root, '--map-tokens', String(budget));
  assert.match(out, /trimmed 1 from Class graph/);
  const md = fs.readFileSync(path.join(root, '.claude', 'codemap.md'), 'utf8');
  assert.match(md, /_1 least-imported classes left out to fit the size cap/);
  assert.doesNotMatch(md, /- class: `Counter`/);
  const json = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8'));
  assert.ok(json.classes.some((c) => c.name === 'Counter'));
});

test('a cap the untrimmable sections already exceed trims nothing', () => {
  const root = project(FILES);
  const out = run(root, '--map-tokens', '1');
  assert.match(out, /nothing trimmed/);
  const md = fs.readFileSync(path.join(root, '.claude', 'codemap.md'), 'utf8');
  assert.match(md, /- class: `Counter`/);
});

test('a run with nothing new leaves both files as they were', () => {
  const root = project(FILES);
  run(root);
  const before = fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8');
  assert.match(run(root), /unchanged \.claude\/codemap\.md/);
  assert.equal(fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8'), before);
});

test('a project big enough for parallel parsing gets the same per-file data', () => {
  const files = {};
  for (let i = 0; i < 80; i++) files[`src/m${i}.ts`] = `// Module ${i}\n\nexport function f${i}(): number {\n  return ${i};\n}\n`;
  const root = project(files);
  run(root, '--no-cache');
  const json = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'codemap.json'), 'utf8'));
  for (let i = 0; i < 80; i++) {
    const f = json.files[`src/m${i}.ts`];
    assert.equal(f.purpose, `Module ${i}`);
    assert.deepEqual(f.symbols.map((s) => [s.name, s.line, s.exported]), [[`f${i}`, 3, true]]);
  }
});
