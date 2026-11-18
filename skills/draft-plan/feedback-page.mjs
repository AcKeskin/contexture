#!/usr/bin/env node
// Render a plan as a feedback page: mark lines, write notes, copy them back to chat.
// No dependencies.
//   node feedback-page.mjs <plan.md> [out.html]
// Default out: .draft-plan.feedback.html next to the input. An input named .draft-plan.*
// is a temp file and is deleted after rendering. Prints the page path.

import { readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const OUT = '.draft-plan.feedback.html';

// One entry per source line after the frontmatter. n is the 1-based line in the file.
// kind: h | li | code | fence | table | blank | p. under: the nearest heading above.
export function parseLines(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let start = 0;
  if (src[0] === '---') {
    const end = src.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  const lines = [];
  let inCode = false;
  let under = '';
  for (let i = start; i < src.length; i++) {
    const t = src[i];
    const n = i + 1;
    if (/^\s*(```|~~~)/.test(t)) { inCode = !inCode; lines.push({ n, kind: 'fence', text: t, under }); continue; }
    if (inCode) { lines.push({ n, kind: 'code', text: t, under }); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { under = h[2].trim(); lines.push({ n, kind: 'h', level: h[1].length, text: under, under }); continue; }
    if (!t.trim()) { lines.push({ n, kind: 'blank', text: '', under }); continue; }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(t)) {
      const indent = (/^\s*/.exec(t)[0].length / 2) | 0;
      lines.push({ n, kind: 'li', indent, text: t.trim(), under });
      continue;
    }
    if (/^\s*\|/.test(t)) { lines.push({ n, kind: 'table', text: t.trim(), under }); continue; }
    lines.push({ n, kind: 'p', text: t.trim(), under });
  }
  while (lines.length && lines[lines.length - 1].kind === 'blank') lines.pop();
  return lines;
}

// Page zoom. The one copy lives in design-proposal; skip it when that skill is absent.
const ZOOM = join(here, '..', 'design-proposal', 'assets', 'zoom.js');
const zoom = () => (existsSync(ZOOM) ? `<script>\n${readFileSync(ZOOM, 'utf8')}</script>` : '');

export function render(text, { title } = {}) {
  const lines = parseLines(text);
  if (!lines.some((l) => l.kind !== 'blank')) throw new Error('plan is empty');
  const t = title || lines.find((l) => l.kind === 'h')?.text || 'Plan';
  // Inside <script>: escape "<" so plan text like "</script>" cannot end the block.
  const json = JSON.stringify({ title: t, lines }).replace(/</g, '\\u003c');
  const tpl = readFileSync(join(here, 'assets', 'feedback-page.html'), 'utf8');
  return tpl.replace('{{ZOOM}}', zoom).replace('{{TITLE}}', () => esc(t)).replace('{{DATA}}', () => json);
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    process.stderr.write('usage: node feedback-page.mjs <plan.md> [out.html]\n');
    process.exit(2);
  }
  try {
    const out = output || join(dirname(input), OUT);
    writeFileSync(out, render(readFileSync(input, 'utf8')));
    if (basename(input).startsWith('.draft-plan.') && basename(input) !== OUT) rmSync(input, { force: true });
    process.stdout.write(`${out}\n`);
  } catch (e) {
    process.stderr.write(`not rendered: ${e.message}\n`);
    process.exit(1);
  }
}

// realpath: skills are often installed as symlinks, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
