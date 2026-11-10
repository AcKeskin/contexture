import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { render, validate, lexicon, save } from './render-page.mjs';

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
  const [j1, h1] = save(tmp(), 'spec', root);
  assert.match(j1, /[\\/]\.claude[\\/]writes[\\/]spec[\\/]v1\.json$/);
  assert.ok(existsSync(h1));
  assert.ok(!existsSync(join(root, '.write-run.tmp.json')));
  const [j2] = save(tmp(), 'spec', root);
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
