#!/usr/bin/env node
// Guided tour: a short reading order through the code for someone new to it.
//
//   node tour.mjs draft  [--root <dir>] [--stops N]   write .claude/codemap.tour.json from codemap.json
//   node tour.mjs render [--root <dir>] [--codetour]  check the tour, write .claude/codemap.tour.md
//                                                      (--codetour: also .tours/codemap.tour for VS Code CodeTour)
//
// The draft is mechanical: with named components, one stop per component from the entry side down;
// otherwise entry points first, then the files they import, most used first. Each stop is a file,
// a line and a `why`. The model then reads each stop and rewrites `why` (see SKILL.md, Guided tour).
// Idea from Understand Anything's guided tours and microsoft/codetour (read 2026-11-22).

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assign, componentEdges, readComponents } from './components.mjs';

const DEFAULT_STOPS = 12;
const FOLLOW = 3; // imports followed from each stop, so one big folder doesn't take the whole tour
const MAX_STOPS = 20;
const TEST_RE = /(^|\/)(tests?|__tests__|specs?)\/|[._-](test|spec)s?\.[^/]+$|(^|\/)test_[^/]+\.py$|Tests?\.cs$/i;

const used = (f) => (f.importedBy || []).length;
const score = (f) => used(f) * 2 + (f.commits || 0) + Math.log2(1 + (f.lines || 0));

// Files a tour may stop at: no tests or vendored files; prose only when the repo is mostly prose.
function candidates(json) {
  const all = Object.entries(json.files || {}).filter(([rel, f]) => !f.vendored && !f.isTest && !TEST_RE.test(rel));
  const code = all.filter(([, f]) => !['markdown', 'other'].includes(f.lang));
  return new Map(code.length >= all.length * 0.2 ? code : all);
}

// The line to open at: the exported symbol that calls the most, else the first exported one,
// else the function that calls the most, else the first symbol.
function lineOf(json, rel) {
  const syms = (json.files[rel].symbols || []).filter((x) => x.line);
  const calls = new Map();
  for (const c of json.callSequences || []) if (c.file === rel) calls.set(c.caller, (c.callees || []).length);
  const most = (xs) => xs.filter((x) => calls.has(x.name)).sort((a, b) => calls.get(b.name) - calls.get(a.name) || a.line - b.line)[0];
  const exported = syms.filter((x) => x.exported);
  const s = most(exported) || exported[0] || most(syms) || syms[0];
  return { line: s?.line || 1, symbol: s?.name };
}

function stop(json, rel, extra) {
  const f = json.files[rel];
  const { line, symbol } = lineOf(json, rel);
  const facts = [extra, used(f) ? `Used by ${used(f)} file${used(f) === 1 ? '' : 's'}.` : ''].filter(Boolean).join(' ');
  const purpose = f.purpose ? (/[.!?…]$/.test(f.purpose) ? f.purpose : f.purpose + '.') : '';
  return { file: rel, line, symbol, title: symbol ? `${rel.split('/').pop()} · ${symbol}` : rel.split('/').pop(), why: [purpose, facts].filter(Boolean).join(' ') || `${f.lines || 0} lines in ${rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : 'the project root'}.` };
}

// Order components so the ones that depend on others come first (the entry side), cycles broken by name.
function componentOrder(ids, edges) {
  const out = new Map(ids.map((id) => [id, new Set()]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const k of edges.keys()) {
    const [a, b] = k.split('\t');
    if (!out.has(a) || !out.has(b) || out.get(a).has(b)) continue;
    out.get(a).add(b); indeg.set(b, indeg.get(b) + 1);
  }
  const order = [];
  const left = new Set(ids);
  while (left.size) {
    const ready = [...left].filter((id) => indeg.get(id) === 0).sort();
    const pick = ready.length ? ready[0] : [...left].sort((a, b) => indeg.get(a) - indeg.get(b) || a.localeCompare(b))[0];
    left.delete(pick); order.push(pick);
    for (const b of out.get(pick)) indeg.set(b, indeg.get(b) - 1);
  }
  return order;
}

export function draft(json, { stops = DEFAULT_STOPS, components = null } = {}) {
  const n = Math.min(Math.max(1, stops), MAX_STOPS);
  const pool = candidates(json);
  const entries = new Map((json.entryPoints || []).filter((e) => pool.has(e.rel)).map((e) => [e.rel, e.role]));
  const picked = [];
  const seen = new Set();
  const add = (rel, extra) => { if (seen.has(rel) || picked.length >= n) return; seen.add(rel); picked.push(stop(json, rel, extra)); };
  const best = (rels) => rels.filter((r) => pool.has(r)).sort((a, b) => (entries.has(b) - entries.has(a)) || score(pool.get(b)) - score(pool.get(a)) || a.localeCompare(b))[0];

  if (components?.components?.length) {
    const { byFile } = assign(components, Object.keys(json.files));
    const ids = components.components.map((c) => c.id);
    const order = componentOrder(ids, componentEdges(json.files, byFile));
    for (const id of order) {
      const c = components.components.find((x) => x.id === id);
      const rel = best([...byFile].filter(([, cid]) => cid === id).map(([r]) => r));
      if (rel) add(rel, `Start of ${c.name}.${entries.has(rel) ? ` Entry point (${entries.get(rel)}).` : ''}`);
    }
  }
  // Entry points, else the files that look like them: top-level script code, many imports and few importers.
  let seeds = [...entries.keys()];
  if (!seeds.length) {
    const scripts = new Set((json.callSequences || []).filter((c) => c.caller === '<module>').map((c) => c.file));
    seeds = [...pool].filter(([, f]) => (f.imports || []).length > 0)
      .sort((a, b) => (scripts.has(b[0]) - scripts.has(a[0])) || ((b[1].imports.length - used(b[1])) - (a[1].imports.length - used(a[1]))) || a[0].localeCompare(b[0]))
      .slice(0, 2).map(([rel]) => rel);
  }
  const queue = [];
  for (const rel of seeds) { add(rel, entries.has(rel) ? `Entry point (${entries.get(rel)}).` : 'A good place to start: it pulls the others in.'); queue.push(rel); }
  // Then what those files import, most used first, so each stop builds on one already seen.
  while (queue.length && picked.length < n) {
    const from = queue.shift();
    const next = (json.files[from].imports || []).filter((t) => pool.has(t) && !seen.has(t)).sort((a, b) => score(pool.get(b)) - score(pool.get(a))).slice(0, FOLLOW);
    for (const t of next) { add(t, `Imported by ${from.split('/').pop()}.`); queue.push(t); }
  }
  // Fill up with the most used files not yet seen.
  for (const [rel] of [...pool].sort((a, b) => score(b[1]) - score(a[1]) || a[0].localeCompare(b[0]))) add(rel, '');
  return { version: 1, project: json.project || '', drafted: true, stops: picked };
}

// Problems that make the tour wrong: unknown files, lines past the end, too many stops.
export function checkTour(tour, json) {
  const problems = [];
  const stops = tour.stops || [];
  if (!stops.length) problems.push('no stops');
  if (stops.length > MAX_STOPS) problems.push(`${stops.length} stops; keep it to ${MAX_STOPS} or fewer`);
  stops.forEach((s, i) => {
    const f = json.files?.[s.file];
    if (!f) problems.push(`stop ${i + 1}: ${s.file} is not in the codemap`);
    else if (s.line && f.lines && s.line > f.lines) problems.push(`stop ${i + 1}: line ${s.line} is past the end of ${s.file} (${f.lines} lines)`);
    if (!s.why) problems.push(`stop ${i + 1}: no why`);
  });
  return problems;
}

export function markdown(tour) {
  const out = [`# Tour of ${tour.project || 'the code'}`, '', `${tour.stops.length} stops, read in order. Each builds on the ones before.`, ''];
  tour.stops.forEach((s, i) => out.push(`${i + 1}. **${s.title || s.file}** \`${s.file}:${s.line || 1}\``, `   ${s.why}`, ''));
  if (tour.drafted) out.push('_Drafted from the codemap only. The reasons have not been checked against the code yet._', '');
  return out.join('\n');
}

// VS Code CodeTour format (https://aka.ms/codetour-schema).
export function codetour(tour) {
  return {
    $schema: 'https://aka.ms/codetour-schema',
    title: `Tour of ${tour.project || 'the code'}`,
    steps: tour.stops.map((s) => ({ file: s.file, line: s.line || 1, title: s.title || s.file, description: s.why })),
  };
}

function main(argv) {
  const cmd = argv[0];
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(opt('--root') || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (cmd !== 'draft' && cmd !== 'render') {
    console.error('usage: node tour.mjs draft [--root <dir>] [--stops N]\n       node tour.mjs render [--root <dir>] [--codetour]');
    process.exit(2);
  }
  const jp = join(root, '.claude', 'codemap.json');
  if (!existsSync(jp)) { console.error('no .claude/codemap.json: run /update-codemap first'); process.exit(1); }
  const json = JSON.parse(readFileSync(jp, 'utf8'));
  const tp = join(root, '.claude', 'codemap.tour.json');
  if (cmd === 'draft') {
    let components = null;
    try { components = readComponents(root); } catch { console.error('codemap.components.json does not parse; drafting without components'); }
    const tour = draft(json, { stops: parseInt(opt('--stops'), 10) || DEFAULT_STOPS, components });
    writeFileSync(tp, JSON.stringify(tour, null, 2) + '\n');
    console.log(`wrote .claude/codemap.tour.json (${tour.stops.length} stops, draft)`);
    tour.stops.forEach((s, i) => console.log(`${i + 1}. ${s.file}:${s.line}  ${s.why}`));
    return;
  }
  if (!existsSync(tp)) { console.error('no .claude/codemap.tour.json: run `tour.mjs draft` first'); process.exit(1); }
  const tour = JSON.parse(readFileSync(tp, 'utf8'));
  const problems = checkTour(tour, json);
  for (const p of problems) console.log(`problem: ${p}`);
  if (problems.length) process.exit(1);
  writeFileSync(join(root, '.claude', 'codemap.tour.md'), markdown(tour));
  console.log('wrote .claude/codemap.tour.md');
  if (argv.includes('--codetour')) {
    mkdirSync(join(root, '.tours'), { recursive: true });
    writeFileSync(join(root, '.tours', 'codemap.tour'), JSON.stringify(codetour(tour), null, 2) + '\n');
    console.log('wrote .tours/codemap.tour (open it with the CodeTour extension in VS Code)');
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) main(process.argv.slice(2));
