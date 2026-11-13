// node --test skills/design-proposal/zoom.test.mjs
// zoom.js has one source; the page shell keeps a copy and the review/write renderers inline it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render as renderWrite } from '../write/render-page.mjs';

const path = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const zoom = read('./assets/zoom.js');

test('page shell carries the current zoom.js', () => {
  assert.ok(read('./assets/page-shell.html').includes(`<script>\n${zoom}</script>`), 'copy assets/zoom.js into page-shell.html');
});

test('review page inlines zoom.js', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zoom-'));
  try {
    const out = join(dir, 'r.html');
    execFileSync(process.execPath, [path('../review/render-page.mjs'), path('../review/assets/example-findings.json'), out]);
    const html = readFileSync(out, 'utf8');
    assert.ok(html.includes(zoom));
    assert.ok(html.includes('data-zoom-page'));
    assert.ok(!html.includes('{{ZOOM}}'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('write page inlines zoom.js', () => {
  const html = renderWrite(JSON.parse(read('../write/assets/example-drafts.json')));
  assert.ok(html.includes(zoom));
  assert.ok(html.includes('data-zoom-page'));
});
