import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { render, validate, lexicon, save, text, splitFile, SKEL } from './render-page.mjs';
import { split, sentences, merge, check, textOf, TERM_RE } from './prep.mjs';

const example = () => JSON.parse(readFileSync(new URL('./assets/example-drafts.json', import.meta.url), 'utf8'));
const dataOf = (html) => JSON.parse(/const DATA = (.*);\n/.exec(html)[1]);

test('example renders with its data and the catalogue lexicon', () => {
  const html = render(example());
  assert.match(html, /<title>XR_SAMPLE_controller_pulse<\/title>/);
  const d = dataOf(html);
  assert.equal(d.parts.length, 5);
  assert.ok(d.lexicon.includes('delve'));
  assert.ok(!html.includes('{{'));
});

test('lexicon reads section A of the newest catalogue', () => {
  const words = lexicon();
  assert.ok(words.includes('utilize'), 'long-word substitution kept');
  assert.ok(words.includes('leverage'), 'parenthetical dropped');
});

test('draft text cannot close the script block', () => {
  const d = example();
  d.parts[0].sentences[0].options[1].text = 'Bad </script><script>alert(1)</script>';
  d.title = '<b>t</b>';
  const html = render(d);
  assert.ok(!html.includes('</script><script>alert'));
  assert.match(html, /<title>&lt;b&gt;t&lt;\/b&gt;<\/title>/);
  assert.equal(dataOf(html).parts[0].sentences[0].options[1].text, 'Bad </script><script>alert(1)</script>');
});

test('validation names the bad part', () => {
  assert.throws(() => validate({ parts: [] }), /non-empty/);
  assert.throws(() => validate({ parts: [{ id: 'a', kind: 'text', sentences: [{ options: [] }] }] }), /parts\[0\] \(a\)\.sentences\[0\]/);
  assert.throws(() => validate({ parts: [{ id: 'a', kind: 'locked' }] }), /locked part needs "text"/);
  assert.throws(() => validate({ parts: [{ id: 'a', kind: 'locked', text: '' }, { id: 'a', kind: 'locked', text: '' }] }), /unique "id"/);
  assert.throws(() => validate({ parts: [{ id: 'a', kind: 'text', sentences: [{ sep: 1, options: [{ text: 'x' }] }] }] }), /"sep" must be a string/);
  assert.throws(() => validate({ parts: [{ id: 'a', kind: 'locked', text: '', heading: 2 }] }), /"heading" must be a string/);
});

test('--save writes the next version under .claude/writes and deletes the temp file', () => {
  const root = mkdtempSync(join(tmpdir(), 'write-'));
  const tmp = () => { const f = join(root, '.write-run.tmp.json'); writeFileSync(f, JSON.stringify(example())); return f; };
  const [j1, h1] = save(tmp(), 'spec', root, { force: true }).paths;
  assert.match(j1, /[\\/]\.claude[\\/]writes[\\/]spec[\\/]v1\.json$/);
  assert.ok(existsSync(h1));
  assert.ok(!existsSync(join(root, '.write-run.tmp.json')));
  assert.throws(() => save(tmp(), 'spec', root), /drop terms[\s\S]*missing MUST/);
  const [j2] = save(tmp(), 'spec', root, { force: true }).paths;
  assert.match(j2, /v2\.json$/);
  assert.deepEqual(readdirSync(join(root, '.claude', 'writes', 'spec')).sort(), ['v1.html', 'v1.json', 'v2.html', 'v2.json']);
  assert.throws(() => save(tmp(), '../x', root), /slug/);
});

test('every mode in modes.md has a live ask in the page', () => {
  const modes = [...readFileSync(new URL('./modes.md', import.meta.url), 'utf8').matchAll(/^\| ([A-Z][\w ]+?) \|/gm)]
    .map((m) => m[1]).filter((m) => m !== 'Mode');
  const page = readFileSync(new URL('./assets/write-page.html', import.meta.url), 'utf8');
  const tones = [.../const TONES = \[([\s\S]*?)\n\];/.exec(page)[1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(modes.length, 8);
  assert.deepEqual(tones, modes);
});

const DOC = `---
title: x
---

# Tool

Run the tool. It reads config, e.g. the \`a.b\` file. Then it stops.

## Usage

- Install it.
- Run it. It MUST exit 0.
  1. nested item

\`\`\`sh
npm i x
\`\`\`

| a | b |
| - | - |

We leverage a robust pipeline to seamlessly unlock value.
`;

test('sentences: no split after abbreviations, initials or inside code', () => {
  assert.deepEqual(sentences('It reads e.g. the `a. B` file. Then J. Doe stops! Ok.'), ['It reads e.g. the `a. B` file.', 'Then J. Doe stops!', 'Ok.']);
});

test('split keeps the file shape and locks code, tables and front matter', () => {
  const { skeleton, flagged } = split(DOC, { lex: lexicon() });
  assert.deepEqual(skeleton.parts.map((p) => `${p.id}:${p.kind}:${p.heading}`), [
    'p1:locked:', 'p2:text:# Tool', 'p3:text:## Usage', 'p4:locked:', 'p5:locked:', 'p6:text:']);
  assert.equal(skeleton.parts[1].sentences.length, 3);
  assert.deepEqual(skeleton.parts[2].sentences.map((s) => s.sep), ['- ', '\n- ', ' ', '\n  1. ']);
  assert.deepEqual(flagged.map((f) => f.ref), ['p6.1']);
  assert.match(flagged[0].why[0], /^ai: .*leverage/);
  assert.equal(textOf(skeleton), DOC, 'round trip with no options');
});

test('split --all flags every sentence', () => {
  assert.equal(split('One. Two.', { all: true }).flagged.length, 2);
});

test('merge adds options by ref, picks them, locks parts; bad refs fail', () => {
  const { skeleton } = split(DOC);
  const d = merge(skeleton, { title: 'T', options: { 'p2.1': [{ text: 'Start the tool.', tone: 'Plain' }] }, lock: ['p6'] });
  assert.equal(d.parts[1].sentences[0].pick, 1);
  assert.equal(d.parts[1].sentences[0].options[1].from, 'A');
  assert.equal(d.parts[5].kind, 'locked');
  assert.match(textOf(d), /^---[\s\S]*Start the tool\. It reads/);
  assert.throws(() => merge(skeleton, { options: { 'p9.1': [] } }), /no sentence "p9.1"/);
});

test('check: dropped terms are errors, added terms and new catalogue words are warnings', () => {
  const { skeleton } = split('It MUST exit 0.');
  const d = merge(skeleton, { options: { 'p1.1': [{ text: 'It exits.' }, { text: 'It MUST exit 0 3 times to leverage it.' }] } });
  const r = check(d, lexicon());
  assert.deepEqual(r.errors, ['p1.1 B: missing MUST, 0']);
  assert.ok(r.warnings.includes('p1.1 C: added 3'));
  assert.ok(r.warnings.some((w) => /C: catalogue words .*leverage/.test(w)));
  assert.deepEqual(d.parts[0].sentences[0].options[2].tells, ['leverage']);
});

test('--split then --save and --text: temp files go, text comes back', () => {
  const root = mkdtempSync(join(tmpdir(), 'write-'));
  const src = join(root, '.write-run.src.md');
  writeFileSync(src, DOC);
  assert.match(splitFile(src, root, { lex: lexicon() }), /1 flagged[\s\S]*p6\.1 \[ai: /);
  assert.ok(!existsSync(src) && existsSync(join(root, SKEL)));
  const tmp = join(root, '.write-run.tmp.json');
  writeFileSync(tmp, JSON.stringify({ options: { 'p6.1': [{ text: 'We use a pipeline.' }] } }));
  const t = text(tmp, root);
  assert.match(t.text, /We use a pipeline\.\n$/);
  assert.ok(!existsSync(tmp) && !existsSync(join(root, SKEL)));
});

test('prep.mjs and the page use the same term regex', () => {
  const page = readFileSync(new URL('./assets/write-page.html', import.meta.url), 'utf8');
  assert.equal(/const TERM_RE = (\/.*\/g);/.exec(page)[1], String(TERM_RE));
});

test('CRLF files come back as CRLF', () => {
  const crlf = DOC.replace(/\n/g, '\r\n');
  const { skeleton } = split(crlf);
  assert.equal(skeleton.eol, '\r\n');
  assert.equal(textOf(skeleton), crlf);
  validate(skeleton);
});
