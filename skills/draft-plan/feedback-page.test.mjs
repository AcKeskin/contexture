import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLines, render, OUT } from './feedback-page.mjs';

const PLAN = [
  '---', 'slug: cart', 'version: 1', '---',
  '# Plan — cart (v1)', '', '## Step 1: Add coupon check',
  '- Files: `src/cart.ts`', '  - Outcome: expired coupons fail', '```ts', 'if (x) {}', '```',
  '| a | b |', 'Plain line.', '', '',
].join('\n');
const dataOf = (html) => JSON.parse(/const DATA = (.*);\n/.exec(html)[1]);

test('frontmatter is skipped and line numbers follow the file', () => {
  const lines = parseLines(PLAN);
  assert.equal(lines[0].n, 5);
  assert.deepEqual(lines.map((l) => l.kind), ['h', 'blank', 'h', 'li', 'li', 'fence', 'code', 'fence', 'table', 'p']);
  assert.equal(lines[4].indent, 1);
  assert.equal(lines[9].n, 14);
});

test('each line knows the heading above it', () => {
  const lines = parseLines(PLAN);
  assert.equal(lines.find((l) => l.text.startsWith('- Files')).under, 'Step 1: Add coupon check');
  assert.equal(lines.find((l) => l.kind === 'code').under, 'Step 1: Add coupon check');
});

test('a heading inside a code block is code, not a heading', () => {
  assert.deepEqual(parseLines('```\n# not a heading\n```').map((l) => l.kind), ['fence', 'code', 'fence']);
});

test('CRLF and BOM input parse the same as LF', () => {
  assert.deepEqual(parseLines(PLAN.replace(/\n/g, '\r\n')), parseLines(PLAN));
  assert.deepEqual(parseLines('\uFEFF' + PLAN), parseLines(PLAN));
});

test('page carries title and lines; plan text cannot close the script block', () => {
  const html = render(PLAN + '\nBad </script><script>alert(1)</script>');
  assert.match(html, /<title>Plan — cart \(v1\)<\/title>/);
  assert.ok(!html.includes('</script><script>alert'));
  assert.ok(!html.includes('{{'));
  const d = dataOf(html);
  assert.equal(d.title, 'Plan — cart (v1)');
  assert.equal(d.lines.at(-1).text, 'Bad </script><script>alert(1)</script>');
});

test('an empty plan is refused', () => {
  assert.throws(() => render('---\nslug: x\n---\n\n'), /empty/);
});

test('CLI writes the page next to the input and deletes a .draft-plan temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-fb-'));
  const tmp = join(dir, '.draft-plan.tmp.md');
  writeFileSync(tmp, PLAN);
  const out = execFileSync('node', [fileURLToPath(new URL('./feedback-page.mjs', import.meta.url)), tmp], { encoding: 'utf8' }).trim();
  assert.equal(out, join(dir, OUT));
  assert.ok(existsSync(out));
  assert.ok(!existsSync(tmp));
  const keep = join(dir, 'plan.md');
  writeFileSync(keep, PLAN);
  execFileSync('node', [fileURLToPath(new URL('./feedback-page.mjs', import.meta.url)), keep, join(dir, 'p.html')]);
  assert.ok(existsSync(keep));
});
