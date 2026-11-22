#!/usr/bin/env node
// Named components for the codemap: the model groups folders into components, this script
// gives it a compact input and checks what it wrote.
//
//   node components.mjs prompt [--root <dir>]   print the input for the model (folders, purposes, links)
//   node components.mjs check  [--root <dir>]   check .claude/codemap.components.json against codemap.json
//
// .claude/codemap.components.json:
//   { "version": 1,
//     "components": [{ "id": "review", "name": "Code review", "description": "…", "layer": "service",
//                      "paths": ["skills/review/", "hooks/lib/review-gate.js"] }],
//     "links": [{ "from": "review", "to": "codemap", "label": "reads the codemap" }] }
// A path ending in "/" takes a folder ("./" the files at the root), anything else one file. The longest matching path wins.
// Files no path takes go to "Other". Idea from CodeBoarding and Understand Anything (read 2026-11-22).

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = ['ui', 'api', 'service', 'data', 'infra', 'tooling', 'tests', 'docs', 'config'];
export const OTHER = { id: 'other', name: 'Other', description: 'Files no component claims.', layer: '', paths: [] };
const FOLDER_DEPTH = 3;
const FOLDER_CAP = 150;
const REF_LINK_CAP = 10;

export function readComponents(root) {
  const p = join(root, '.claude', 'codemap.components.json');
  if (!existsSync(p)) return null;
  // Windows PowerShell 5 writes a BOM, which JSON.parse rejects.
  return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

// rel -> component id, by the longest matching path. Unclaimed files go to "other".
export function assign(doc, rels) {
  const rules = [];
  for (const c of doc.components || []) for (const p of c.paths || []) rules.push({ p, id: c.id });
  rules.sort((a, b) => b.p.length - a.p.length);
  const byFile = new Map();
  const used = new Set();
  for (const rel of rels) {
    const hit = rules.find((r) => (r.p === './' ? !rel.includes('/') : r.p.endsWith('/') ? rel.startsWith(r.p) : rel === r.p));
    byFile.set(rel, hit ? hit.id : OTHER.id);
    if (hit) used.add(hit.p);
  }
  return { byFile, unusedPaths: rules.filter((r) => !used.has(r.p)).map((r) => r.p).sort() };
}

// Import (or, with key "refs", reference) counts between components: Map "a\tb" -> n.
export function componentEdges(files, byFile, key = 'imports') {
  const m = new Map();
  for (const [rel, f] of Object.entries(files)) {
    const a = byFile.get(rel);
    for (const t of f[key] || []) {
      const b = byFile.get(t);
      if (!b || a === b) continue;
      const k = `${a}\t${b}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return m;
}

const LAYER_COLOURS = { ui: '#7C4DCC', api: '#0E6E74', service: '#2F6FD0', data: '#B4540A', infra: '#56636F', tooling: '#1E7A46', tests: '#A15C07', docs: '#8A6D3B', config: '#6B7785' };

// Mermaid flowchart of the components: boxes coloured by layer. Import links solid, reference-only links dashed,
// each labelled by the model when it named the link, else by its count. A named link with neither is drawn dashed too.
export function componentMermaid(json, doc, isSkipped = () => false) {
  const files = Object.fromEntries(Object.entries(json.files || {}).filter(([rel, f]) => !f.vendored && !isSkipped(rel)));
  const { byFile } = assign(doc, Object.keys(files));
  const counts = new Map();
  for (const id of byFile.values()) counts.set(id, (counts.get(id) || 0) + 1);
  const comps = [...(doc.components || []), OTHER].filter((c) => counts.has(c.id));
  if (!comps.length) return null;
  const nid = (id) => 'c_' + String(id).replace(/[^A-Za-z0-9]/g, '_');
  const label = new Map((doc.links || []).map((l) => [`${l.from}\t${l.to}`, l.label]));
  const lines = ['flowchart TB'];
  for (const c of comps) lines.push(`  ${nid(c.id)}["${String(c.name).replace(/"/g, "'")}<br/><small>${counts.get(c.id)} files</small>"]${LAYER_COLOURS[c.layer] ? ':::' + c.layer : ''}`);
  const q = (s) => String(s).replace(/"/g, "'");
  const imports = componentEdges(files, byFile);
  const refs = componentEdges(files, byFile, 'refs');
  const shown = new Set(comps.map((c) => c.id));
  for (const [k, n] of [...imports].sort((a, b) => b[1] - a[1])) {
    const [a, b] = k.split('\t');
    lines.push(`  ${nid(a)} -->|"${q(label.get(k) || n)}"| ${nid(b)}`);
  }
  // Reference-only links are many in Markdown-heavy repos: keep the strongest few, plus every named one.
  const refOnly = [...refs].filter(([k]) => !imports.has(k)).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of refOnly.filter(([k, n], i) => label.has(k) || (i < REF_LINK_CAP && n >= 3))) {
    const [a, b] = k.split('\t');
    lines.push(`  ${nid(a)} -.->|"${q(label.get(k) || `refs ${n}`)}"| ${nid(b)}`);
  }
  for (const [k, said] of label) {
    const [a, b] = k.split('\t');
    if (imports.has(k) || refs.has(k) || !shown.has(a) || !shown.has(b)) continue;
    lines.push(`  ${nid(a)} -.->|"${q(said)}"| ${nid(b)}`);
  }
  for (const l of new Set(comps.map((c) => c.layer).filter((x) => LAYER_COLOURS[x]))) lines.push(`  classDef ${l} stroke:${LAYER_COLOURS[l]},stroke-width:3px`);
  return lines.join('\n');
}

// Problems a re-write should fix; an empty list means the file is usable as is.
export function check(doc, json) {
  const problems = [];
  const ids = new Set();
  for (const c of doc.components || []) {
    if (!c.id || !c.name) problems.push(`component without id or name: ${JSON.stringify(c).slice(0, 80)}`);
    if (ids.has(c.id)) problems.push(`duplicate id: ${c.id}`);
    ids.add(c.id);
    if (c.layer && !LAYERS.includes(c.layer)) problems.push(`${c.id}: layer "${c.layer}" is not one of ${LAYERS.join(', ')}`);
    if (!c.paths?.length) problems.push(`${c.id}: no paths`);
  }
  for (const l of doc.links || []) {
    if (!ids.has(l.from) || !ids.has(l.to)) problems.push(`link ${l.from} -> ${l.to}: unknown component`);
  }
  const rels = Object.keys(json.files || {}).filter((r) => !json.files[r].vendored);
  const { byFile, unusedPaths } = assign(doc, rels);
  for (const p of unusedPaths) problems.push(`path matches no file: ${p}`);
  const other = rels.filter((r) => byFile.get(r) === OTHER.id);
  const counts = new Map();
  for (const id of byFile.values()) counts.set(id, (counts.get(id) || 0) + 1);
  return { problems, other, counts, files: rels.length };
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const folderOf = (rel, depth) => { const p = rel.split('/'); return p.length === 1 ? './' : p.slice(0, Math.min(depth, p.length - 1)).join('/') + '/'; };

// The model's input: folders with file counts and their most used purposes, then folder links.
export function prompt(json) {
  const files = Object.entries(json.files || {}).filter(([, f]) => !f.vendored);
  let depth = FOLDER_DEPTH;
  const folders = (d) => {
    const m = new Map();
    for (const [rel, f] of files) {
      const k = folderOf(rel, d);
      const e = m.get(k) || { files: 0, lines: 0, items: [] };
      e.files++; e.lines += f.lines || 0; e.items.push([rel, f]);
      m.set(k, e);
    }
    return m;
  };
  let fm = folders(depth);
  while (fm.size > FOLDER_CAP && depth > 1) fm = folders(--depth);
  const out = [`Project: ${json.project || '?'} (${files.length} files). Folders up to ${depth} levels deep.`];
  if (json.entryPoints?.length) out.push(`Entry points: ${json.entryPoints.map((e) => `${e.rel} (${e.role})`).join(', ')}`);
  out.push('', 'Folders (files, lines, then purposes of the most used files):');
  for (const [k, e] of [...fm].sort((a, b) => a[0].localeCompare(b[0]))) {
    const top = e.items.filter(([, f]) => f.purpose)
      .sort((a, b) => (b[1].importedBy?.length || 0) - (a[1].importedBy?.length || 0) || (b[1].lines || 0) - (a[1].lines || 0))
      .slice(0, 3).map(([rel, f]) => `${rel.slice(k === './' ? 0 : k.length)}: ${clip(f.purpose, 90)}`);
    out.push(`- ${k} (${e.files} files, ${e.lines} lines)${top.length ? '\n    ' + top.join('\n    ') : ''}`);
  }
  const byFile = new Map(files.map(([rel]) => [rel, folderOf(rel, depth)]));
  const edges = [...componentEdges(Object.fromEntries(files), byFile)].sort((a, b) => b[1] - a[1]);
  if (edges.length) {
    out.push('', 'Folder links (imports, most first):');
    for (const [k, n] of edges.slice(0, 200)) { const [a, b] = k.split('\t'); out.push(`- ${a} -> ${b} (${n})`); }
  }
  return out.join('\n') + '\n';
}

function main(argv) {
  const cmd = argv[0];
  const ri = argv.indexOf('--root');
  const root = resolve(ri >= 0 ? argv[ri + 1] : process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const jp = join(root, '.claude', 'codemap.json');
  if (cmd !== 'prompt' && cmd !== 'check') {
    console.error('usage: node components.mjs prompt|check [--root <dir>]');
    process.exit(2);
  }
  if (!existsSync(jp)) { console.error('no .claude/codemap.json: run /update-codemap first'); process.exit(1); }
  const json = JSON.parse(readFileSync(jp, 'utf8'));
  if (cmd === 'prompt') { process.stdout.write(prompt(json)); return; }
  const doc = readComponents(root);
  if (!doc) { console.error('no .claude/codemap.components.json yet'); process.exit(1); }
  const r = check(doc, json);
  for (const c of doc.components || []) console.log(`${c.name} (${c.id}${c.layer ? ', ' + c.layer : ''}): ${r.counts.get(c.id) || 0} files`);
  console.log(`Other: ${r.other.length} of ${r.files} files${r.other.length ? ' — ' + r.other.slice(0, 10).join(', ') + (r.other.length > 10 ? ', …' : '') : ''}`);
  for (const p of r.problems) console.log(`problem: ${p}`);
  if (r.problems.length) process.exit(1);
}

const isMain = process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) main(process.argv.slice(2));
