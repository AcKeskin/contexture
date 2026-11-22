#!/usr/bin/env node
// Checks every diagram on a design-proposal page and, with --shots, saves one PNG per diagram.
// node diagram-check.mjs <page.html> [--shots <dir>]
// Exit 0: no findings. 1: findings (one per line). 2: not checked (bad args, no Playwright or Chromium, page error).
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUDGET = { boxes: 9, edges: 12, plan: 2 };

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { /* try the global install next */ }
  const npm = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const root = npm.status === 0 ? npm.stdout.trim() : '';
  if (!root) return null;
  try { return createRequire(join(root, 'noop.js'))('playwright'); } catch { return null; }
}

// Runs in the page. Unhides the tabs that hold diagrams, then measures each figure's SVG.
function measure(budget) {
  const out = [], seen = {};
  document.querySelectorAll('figure svg').forEach((svg, i) => {
    for (let el = svg.parentElement; el; el = el.parentElement) if (el.hidden) el.hidden = false;
    const section = svg.closest('section[id]');
    const key = section ? section.id : 'page';
    seen[key] = (seen[key] || 0) + 1;
    const where = `${key}#${seen[key]}`;
    svg.closest('figure').dataset.dc = String(i);
    const findings = [];
    const count = (sel) => svg.querySelectorAll(sel).length;
    const boxes = count('.box'), edges = count('.edge'), plan = count('.o');
    const delta = svg.closest('figure').hasAttribute('data-delta');
    if (!delta && boxes > budget.boxes) findings.push(`budget: ${boxes} boxes (max ${budget.boxes}); split into overview + detail`);
    if (!delta && edges > budget.edges) findings.push(`budget: ${edges} arrows (max ${budget.edges}); split into overview + detail`);
    if (plan > budget.plan) findings.push(`budget: ${plan} plan-colored marks (max ${budget.plan}); pick the focal ones`);
    const label = (svg.getAttribute('aria-label') || '').trim() || svg.getAttribute('aria-labelledby');
    if (svg.getAttribute('role') !== 'img' || !label) findings.push('a11y: svg needs role="img" and an aria-label stating the claim');
    if (!svg.closest('figure').querySelector('figcaption')) findings.push('a11y: figure needs a figcaption');
    const vb = svg.viewBox.baseVal;
    if (!vb || !vb.width) findings.push('viewBox: svg has no viewBox');
    else {
      const b = svg.getBBox();
      const cut = [];
      if (b.x < vb.x - 0.5) cut.push('left');
      if (b.y < vb.y - 0.5) cut.push('top');
      if (b.x + b.width > vb.x + vb.width + 0.5) cut.push('right');
      if (b.y + b.height > vb.y + vb.height + 0.5) cut.push('bottom');
      if (cut.length) findings.push(`viewBox: content cut at the ${cut.join(', ')} edge`);
    }
    findings.push(...geometry(svg));
    out.push({ index: i, where, findings });
  });
  return out;

  // Connector and label geometry, in the svg's viewBox units.
  function geometry(svg) {
    const found = new Set();
    const toRoot = (el) => svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const pt = (m, x, y) => { const p = new DOMPoint(x, y).matrixTransform(m); return { x: p.x, y: p.y }; };
    const rectOf = (el) => {
      const b = el.getBBox(), m = toRoot(el);
      const a = pt(m, b.x, b.y), c = pt(m, b.x + b.width, b.y + b.height);
      return { x0: Math.min(a.x, c.x), y0: Math.min(a.y, c.y), x1: Math.max(a.x, c.x), y1: Math.max(a.y, c.y) };
    };
    const r1 = (n) => Math.round(n);
    const name = (c) => `arrow (${r1(c.start.x)},${r1(c.start.y)})→(${r1(c.end.x)},${r1(c.end.y)})`;
    const quote = (t) => `"${t.textContent.trim().slice(0, 30)}"`;

    const boxes = [...svg.querySelectorAll('.box')].map((el) => ({ el, ...rectOf(el) }));
    const conns = [...new Set(svg.querySelectorAll('.edge, [marker-end], [marker-start]'))]
      .filter((el) => !el.closest('defs, marker') && /^(path|line|polyline)$/.test(el.tagName))
      .map((el) => {
        const m = toRoot(el);
        const segs = pieces(el).map((s) => ({ a: pt(m, s.a.x, s.a.y), b: pt(m, s.b.x, s.b.y), straight: s.straight }));
        return segs.length ? { el, segs, start: segs[0].a, end: segs[segs.length - 1].b } : null;
      })
      .filter(Boolean);

    const near = (p, r, pad) => p.x >= r.x0 - pad && p.x <= r.x1 + pad && p.y >= r.y0 - pad && p.y <= r.y1 + pad;
    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const axis = (s) => (Math.abs(s.a.y - s.b.y) <= 0.5 ? 'h' : Math.abs(s.a.x - s.b.x) <= 0.5 ? 'v' : null);

    for (const c of conns) {
      for (const s of c.segs) {
        if (s.straight && !axis(s) && dist(s.a, s.b) > 4 && !c.el.closest('.map')) found.add(`lines: ${name(c)} has a diagonal segment; use horizontal and vertical runs`);
      }
      for (const b of boxes) {
        if (near(c.start, b, 6) || near(c.end, b, 6)) continue;
        const inner = { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
        if (c.segs.some((s) => s.straight && crosses(s, inner))) found.add(`lines: ${name(c)} runs behind a box it does not attach to; reroute`);
      }
    }
    for (let i = 0; i < conns.length; i++) {
      for (let j = i + 1; j < conns.length; j++) {
        const a = conns[i], b = conns[j];
        if (stacked(a, b)) found.add(`lines: ${name(a)} and ${name(b)} are drawn on top of each other; offset one by 12px`);
        if (dist(a.end, b.end) < 8) found.add(`lines: ${name(a)} and ${name(b)} end at one point; give each its own spot on the edge`);
        if (dist(a.start, b.start) < 8) found.add(`lines: ${name(a)} and ${name(b)} start at one point; give each its own spot on the edge`);
      }
    }
    for (const t of svg.querySelectorAll('text')) {
      if (!t.textContent.trim()) continue;
      const r = rectOf(t);
      const mid = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
      for (const b of boxes) {
        const overlaps = r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0;
        if (!overlaps) continue;
        if (t.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) found.add(`labels: ${quote(t)} is covered by a box drawn after it`);
        else if (near(mid, b, 0) && (r.x0 < b.x0 - 1 || r.x1 > b.x1 + 1)) found.add(`labels: ${quote(t)} runs out of its box; shorten it or widen the box`);
      }
      const inner = { x0: r.x0 + 1, y0: r.y0 + 1, x1: r.x1 - 1, y1: r.y1 - 1 };
      if (conns.some((c) => c.segs.some((s) => s.straight && crosses(s, inner)))) found.add(`labels: ${quote(t)} sits on a line; move it 6-10px clear`);
    }
    return [...found];

    function stacked(a, b) {
      for (const s of a.segs) for (const u of b.segs) {
        const k = s.straight && u.straight && axis(s);
        if (!k || axis(u) !== k) continue;
        const [p, q] = k === 'h' ? ['x', 'y'] : ['y', 'x'];
        if (Math.abs(s.a[q] - u.a[q]) > 1) continue;
        const lo = Math.max(Math.min(s.a[p], s.b[p]), Math.min(u.a[p], u.b[p]));
        const hi = Math.min(Math.max(s.a[p], s.b[p]), Math.max(u.a[p], u.b[p]));
        if (hi - lo > 4) return true;
      }
      return false;
    }
  }

  // Liang-Barsky: does segment s pass through rectangle r?
  function crosses(s, r) {
    if (r.x1 <= r.x0 || r.y1 <= r.y0) return false;
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, s.a.x - r.x0], [dx, r.x1 - s.a.x], [-dy, s.a.y - r.y0], [dy, r.y1 - s.a.y]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-6;
  }

  // Splits a line, polyline or path into segments in its own units. Curves and arcs count as one non-straight segment.
  function pieces(el) {
    const n = (a) => parseFloat(el.getAttribute(a) || '0');
    if (el.tagName === 'line') return [{ a: { x: n('x1'), y: n('y1') }, b: { x: n('x2'), y: n('y2') }, straight: true }];
    const segs = [];
    if (el.tagName === 'polyline') {
      const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      for (let k = 2; k + 1 < v.length; k += 2) segs.push({ a: { x: v[k - 2], y: v[k - 1] }, b: { x: v[k], y: v[k + 1] }, straight: true });
      return segs;
    }
    const tok = (el.getAttribute('d') || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const size = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    let cmd = '', i = 0, cur = { x: 0, y: 0 }, open = { x: 0, y: 0 };
    while (i < tok.length) {
      if (/[a-z]/i.test(tok[i])) cmd = tok[i++];
      const up = cmd.toUpperCase(), rel = cmd !== up;
      if (up === 'Z') { if (dist2(cur, open)) segs.push({ a: cur, b: open, straight: true }); cur = open; continue; }
      const v = tok.slice(i, i + size[up]).map(Number);
      if (!up || v.length < size[up] || v.some(Number.isNaN)) break;
      i += size[up];
      const ox = rel ? cur.x : 0, oy = rel ? cur.y : 0;
      let next;
      if (up === 'H') next = { x: v[0] + ox, y: cur.y };
      else if (up === 'V') next = { x: cur.x, y: v[0] + oy };
      else next = { x: v[v.length - 2] + ox, y: v[v.length - 1] + oy };
      if (up === 'M') { cur = open = next; cmd = rel ? 'l' : 'L'; continue; }
      segs.push({ a: cur, b: next, straight: up === 'L' || up === 'H' || up === 'V' });
      cur = next;
    }
    return segs;
  }
  function dist2(p, q) { return p.x !== q.x || p.y !== q.y; }
}

export async function check(page, { shots } = {}) {
  const pw = loadPlaywright();
  if (!pw) throw new Error('Playwright not found. Install it (npm i -g playwright && npx playwright install chromium) or skip the check and say so.');
  const browser = await pw.chromium.launch();
  try {
    const tab = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
    await tab.goto(pathToFileURL(resolve(page)).href);
    await tab.evaluate(() => document.fonts.ready);
    const results = await tab.evaluate(measure, BUDGET);
    if (shots) {
      mkdirSync(shots, { recursive: true });
      for (const r of results) {
        const fig = await tab.$(`figure[data-dc="${r.index}"] .fw`) || await tab.$(`figure[data-dc="${r.index}"]`);
        await fig.screenshot({ path: join(shots, `${r.where.replace('#', '-')}.png`) });
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function main(argv) {
  const [page, ...rest] = argv;
  const at = rest.indexOf('--shots');
  const shots = at >= 0 ? rest[at + 1] : undefined;
  if (!page || !existsSync(page) || (at >= 0 && !shots)) {
    console.error('usage: node diagram-check.mjs <page.html> [--shots <dir>]');
    return 2;
  }
  let results;
  try {
    results = await check(page, { shots });
  } catch (e) {
    console.error(`not checked: ${e.message.split('\n')[0]}`);
    return 2;
  }
  const lines = results.flatMap((r) => r.findings.map((f) => `${r.where} ${f}`));
  if (!results.length) console.log('no diagrams found (figure svg)');
  else if (!lines.length) console.log(`${results.length} diagram(s), no findings`);
  for (const l of lines) console.log(l);
  if (shots) console.log(`shots: ${resolve(shots)}`);
  return lines.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
