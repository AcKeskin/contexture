#!/usr/bin/env node
// Sketch mode helper: sync the vault copy, list view line ranges, run the name check.
// Usage: node sketch-check.mjs <sketch.md> [--mirror <vault copy>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function sections(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), out = [];
  let cur = null, inFence = false;
  lines.forEach((l, i) => {
    if (/^(```|~~~)/.test(l)) inFence = !inFence;
    const m = !inFence && /^##\s+(.+?)\s*$/.exec(l);
    if (m) { if (cur) cur.end = i; cur = { name: m[1], start: i + 1, end: lines.length, body: [] }; out.push(cur); }
    else if (cur) cur.body.push(l);
  });
  for (const s of out) {
    s.body = s.body.join('\n');
    s.blocks = [...s.body.matchAll(/^```(\w*)\n([\s\S]*?)^```/gm)].map(m => ({ lang: m[1], src: m[2] }));
  }
  return out;
}

const kindOf = src => {
  const first = src.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('%%')) || '';
  return first.split(/\s+/)[0];
};

function diagram(secs, heading, kind) {
  const byName = secs.find(s => s.name.toLowerCase() === heading);
  const pool = byName ? [byName] : secs;
  for (const s of pool) for (const b of s.blocks) if (b.lang === 'mermaid' && kindOf(b.src).startsWith(kind)) return b.src;
  return null;
}

export function classNames(src) {
  const out = new Set();
  for (const m of src.matchAll(/^\s*class\s+(\w+)/gm)) out.add(m[1]);
  for (const m of src.matchAll(/^\s*(\w+)\s*(?:"[^"]*"\s*)?(?:<\|?|\*|o)?(?:--|\.\.)(?:\|?>|\*|o)?\s*(?:"[^"]*"\s*)?(\w+)/gm)) { out.add(m[1]); out.add(m[2]); }
  return out;
}

export function participants(src) {
  const own = new Set(), ext = new Set();
  for (const m of src.matchAll(/^\s*(participant|actor)\s+(\w+)/gm)) (m[1] === 'actor' ? ext : own).add(m[2]);
  return { own, ext };
}

export function states(src) {
  const out = new Set();
  for (const m of src.matchAll(/^\s*(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)/gm)) for (const n of [m[1], m[2]]) if (n !== '[*]') out.add(n);
  return out;
}

export function codeTypes(code) {
  const names = new Set(), enums = [];
  for (const m of code.matchAll(/^\s*(?:export\s+|public\s+|abstract\s+|sealed\s+|data\s+)*(?:class|interface|enum|struct|record|protocol|trait|type)\s+(\w+)/gm)) names.add(m[1]);
  // Python enums: class X(Enum): NAME = ...
  for (const m of code.matchAll(/^class\s+(\w+)\((?:[\w.]+,\s*)*(?:\w+\.)?(?:Str|Int)?Enum\):\n((?:[ \t]+.*\n?)+)/gm))
    enums.push({ name: m[1], members: [...m[2].matchAll(/^\s+([A-Za-z_]\w*)\s*=/gm)].map(x => x[1]) });
  // Brace enums: enum X { A, B = 2 }
  for (const m of code.matchAll(/\benum\s+(?:class\s+)?(\w+)[^{]*\{([^}]*)\}/g))
    enums.push({ name: m[1], members: m[2].split(/[,;\n]/).map(x => x.trim().split(/[\s=(]/)[0]).filter(x => /^[A-Za-z_]\w*$/.test(x)) });
  return { names, enums };
}

const norm = s => s.toLowerCase().replace(/_/g, '');

export function check(text) {
  const secs = sections(text), notes = [];
  const cls = diagram(secs, 'classes', 'classDiagram');
  const seq = diagram(secs, 'sequence', 'sequenceDiagram');
  const st = diagram(secs, 'states', 'stateDiagram');
  const order = secs.find(s => s.name.toLowerCase() === 'build order');
  const iface = secs.find(s => s.name.toLowerCase() === 'interfaces');
  const classes = cls ? classNames(cls) : new Set();
  const code = iface ? codeTypes(iface.blocks.filter(b => b.lang !== 'mermaid').map(b => b.src).join('\n')) : { names: new Set(), enums: [] };
  const externals = new Set((text.match(/%%\s*external:\s*(.+)/g) || []).flatMap(l => l.replace(/%%\s*external:/, '').split(/[,\s]+/).filter(Boolean)));
  const known = new Set([...classes, ...code.names, ...externals]);

  if (seq) {
    const { own } = participants(seq);
    for (const p of own) {
      if (known.has(p)) continue;
      const near = [...known].find(c => norm(c).startsWith(norm(p)) || norm(p).startsWith(norm(c)));
      notes.push(`sequence: ${p} has no class` + (near ? ` (${near}?)` : '; add one or mark it external (actor, or %% external: ' + p + ')'));
    }
  }
  if (st && code.enums.length) {
    const ss = [...states(st)];
    const best = code.enums.map(e => ({ e, hit: e.members.filter(m => ss.some(s => norm(s) === norm(m))).length }))
      .sort((a, b) => b.hit - a.hit)[0];
    if (best.hit > 0) {
      const onlyD = ss.filter(s => !best.e.members.some(m => norm(m) === norm(s)));
      const onlyE = best.e.members.filter(m => !ss.some(s => norm(s) === norm(m)));
      if (onlyD.length || onlyE.length) notes.push(`states: differ from ${best.e.name}.` + (onlyD.length ? ` Only in diagram: ${onlyD.join(', ')}.` : '') + (onlyE.length ? ` Only in enum: ${onlyE.join(', ')}.` : ''));
    }
  }
  if (order && classes.size) {
    const miss = [...classes].filter(c => !new RegExp(`\\b${c}\\b`).test(order.body));
    if (miss.length) notes.push(`build order: no step for ${miss.join(', ')}`);
  }
  if (iface && classes.size) {
    const miss = [...classes].filter(c => !code.names.has(c));
    if (miss.length) notes.push(`interfaces: no signature for ${miss.join(', ')}`);
  }
  return { secs, notes };
}

export function sync(file, mirror) {
  if (!mirror) return null;
  if (!existsSync(mirror)) { mkdirSync(dirname(mirror), { recursive: true }); writeFileSync(mirror, readFileSync(file)); return 'mirror created'; }
  const a = readFileSync(file, 'utf8'), b = readFileSync(mirror, 'utf8');
  if (a === b) return null;
  if (statSync(mirror).mtimeMs > statSync(file).mtimeMs) { writeFileSync(file, b); return 'vault copy was newer: copied into the repo file'; }
  writeFileSync(mirror, a); return 'repo file was newer: copied to the vault';
}

// realpath: skills are often installed as symlinks, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2), file = args[0];
  const mi = args.indexOf('--mirror'), mirror = mi >= 0 ? args[mi + 1] : null;
  if (!file || !existsSync(file)) { console.error('usage: node sketch-check.mjs <sketch.md> [--mirror <vault copy>]'); process.exit(2); }
  const synced = sync(file, mirror);
  if (synced) console.log('synced: ' + synced);
  const { secs, notes } = check(readFileSync(file, 'utf8'));
  console.log('views: ' + secs.map(s => `${s.name} ${s.start}-${s.end}`).join(' | '));
  console.log(notes.length ? `check: ${notes.length}\n` + notes.map(n => '- ' + n).join('\n') : 'check: ok');
}
