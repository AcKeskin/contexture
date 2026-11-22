// node --test skills/design-proposal/diagram-check.test.mjs
// Needs Playwright with Chromium; skipped when it is not installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './diagram-check.mjs';

const script = fileURLToPath(new URL('./diagram-check.mjs', import.meta.url));
const shell = fileURLToPath(new URL('./assets/page-shell.html', import.meta.url));
const hasPlaywright = (() => {
  try { createRequire(import.meta.url)('playwright'); return true; } catch { /* fall through */ }
  const root = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout?.trim();
  try { createRequire(join(root, 'noop.js'))('playwright'); return true; } catch { return false; }
})();

const boxes = (n) => Array.from({ length: n }, (_, i) => `<rect class="box" x="${10 + i * 60}" y="20" width="50" height="40"/>`).join('');
const page = (body) => `<!doctype html><meta charset="utf-8"><style>svg{width:700px}</style><body>${body}</body>`;
const fig = (svg, caption = '<figcaption>c</figcaption>') => `<figure><div class="fw">${svg}</div>${caption}</figure>`;

function withPage(html, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dc-'));
  const file = join(dir, 'p.html');
  writeFileSync(file, html);
  return Promise.resolve(fn(file, dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('clean diagram has no findings', { skip: !hasPlaywright }, () => withPage(page(`<section id="ov" hidden>${fig(`<svg viewBox="0 0 700 100" role="img" aria-label="x">${boxes(3)}<path class="edge" d="M60 40 H70"/></svg>`)}</section>`), async (file) => {
  const [r] = await check(file);
  assert.equal(r.where, 'ov#1');
  assert.deepEqual(r.findings, []);
}));

test('reports budget, a11y and viewBox cuts', { skip: !hasPlaywright }, () => withPage(page(fig(`<svg viewBox="0 0 700 100">${boxes(10)}<rect class="box o" x="0" y="70" width="10" height="10"/><path class="edge o" d="M0 0 H1"/><path class="edge o" d="M0 0 H1"/><text x="650" y="95">long label that runs off</text></svg>`, '')), async (file) => {
  const [r] = await check(file);
  const text = r.findings.join('\n');
  assert.match(text, /budget: 11 boxes/);
  assert.match(text, /budget: 3 plan-colored/);
  assert.match(text, /a11y: svg needs role/);
  assert.match(text, /a11y: figure needs a figcaption/);
  assert.match(text, /viewBox: content cut at the right edge/);
}));

const geo = (body) => withPage(page(fig(`<svg viewBox="0 0 700 300" role="img" aria-label="x">${body}</svg>`)), async (file) => (await check(file))[0].findings);
const A = '<rect class="box" x="20" y="20" width="100" height="40"/>';
const B = '<rect class="box" x="300" y="20" width="100" height="40"/>';
const C = '<rect class="box" x="160" y="20" width="100" height="40"/>';

test('clean flow with an elbow, a label and a transform has no findings', { skip: !hasPlaywright }, async () => {
  const f = await geo(`<path class="edge" marker-end="url(#m)" d="M120 40 H300"/>
    <path class="edge" d="M70 60 V100 q0 8 8 8 H342 q8 0 8 -8 V60"/>
    <text x="210" y="32" text-anchor="middle" font-size="11">calls</text>
    <g transform="translate(0 150)">${A}<text x="70" y="45" text-anchor="middle" font-size="12">Client</text></g>${A}${B}`);
  assert.deepEqual(f, []);
});

test('finds diagonal, transit, stacked and shared ends', { skip: !hasPlaywright }, async () => {
  const f = (await geo(`${A}${B}${C}<line class="edge" x1="120" y1="40" x2="300" y2="50"/>
    <path class="edge" d="M120 30 H300"/>
    <path class="edge" d="M70 200 H350"/><path class="edge" d="M100 200.5 H300"/>
    <path class="edge" d="M20 250 H200"/><path class="edge" d="M200 290 V250"/>`)).join('\n');
  assert.match(f, /diagonal segment/);
  assert.match(f, /runs behind a box it does not attach to/);
  assert.match(f, /drawn on top of each other/);
  assert.match(f, /start at one point|end at one point/);
});

test('finds labels that overflow, sit under a later box or sit on a line', { skip: !hasPlaywright }, async () => {
  const f = (await geo(`${A}<text x="25" y="45" font-size="12">a very long name for a small box</text>
    <text x="290" y="45" font-size="12">under</text>${B}
    <path class="edge" d="M20 150 H400"/><text x="200" y="153" font-size="12">on line</text>`)).join('\n');
  assert.match(f, /"a very long name for a small b" runs out of its box/);
  assert.match(f, /"under" is covered by a box drawn after it/);
  assert.match(f, /"on line" sits on a line/);
});

test('mapping bands may slant and delta figures skip the box count', { skip: !hasPlaywright }, () => withPage(page(`<figure data-delta><div class="fw"><svg viewBox="0 0 700 100" role="img" aria-label="x">${boxes(10)}<g class="map"><line class="edge" x1="0" y1="90" x2="60" y2="99"/></g></svg></div><figcaption>c</figcaption></figure>`), async (file) => {
  assert.deepEqual((await check(file))[0].findings, []);
}));

test('the page shell passes and --shots writes one PNG per diagram', { skip: !hasPlaywright }, () => withPage('', (_, dir) => {
  const out = execFileSync(process.execPath, [script, shell, '--shots', dir], { encoding: 'utf8' });
  assert.match(out, /1 diagram\(s\), no findings/);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.png')), ['overview-1.png']);
}));

test('names diagrams per tab', { skip: !hasPlaywright }, () => withPage(page(`<section id="a">${fig('<svg viewBox="0 0 10 10" role="img" aria-label="x"></svg>')}</section><section id="b">${fig('<svg viewBox="0 0 10 10" role="img" aria-label="x"></svg>')}${fig('<svg viewBox="0 0 10 10" role="img" aria-label="x"></svg>')}</section>`), async (file) => {
  assert.deepEqual((await check(file)).map((r) => r.where), ['a#1', 'b#1', 'b#2']);
}));

test('a missing browser exits 2, not 1', { skip: !hasPlaywright }, () => {
  const r = spawnSync(process.execPath, [script, shell], { encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(tmpdir(), 'no-browsers-here') } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^not checked: /);
});

test('bad arguments exit 2', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
