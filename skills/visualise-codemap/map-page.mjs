// Build the clickable codemap page (.claude/codemap.html) from codemap.json.
// One self-contained HTML file: the data, the page script and zoom.js are inlined.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assign, OTHER } from './components.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, 'assets', 'map-page.html');
// Diagram zoom. The one copy lives in design-proposal; skip it when that skill is absent.
const ZOOM = path.join(here, '..', 'design-proposal', 'assets', 'zoom.js');

const FILE_KEYS = ['lang', 'lines', 'purpose', 'isTest', 'vendored', 'imports', 'importedBy', 'refs', 'referencedBy', 'tests', 'testsTotal', 'commits', 'lastChange'];
const SYMBOL_KEYS = ['name', 'kind', 'line', 'endLine', 'parent', 'signature'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// The page data: codemap.json minus what the page never shows, skipped files left out.
// With named components, each file carries its component id as `c`.
// With a tour, its stops (on files still in the map) ride along as `tour`.
// `sources` (readSources) adds file text as `src` for code snippets; `diff` (readDiff) marks changed lines.
export function pageData(json, { root, isSkipped = () => false, components = null, tour = null, sources = null, diff = null } = {}) {
  const keep = (rel) => !isSkipped(rel);
  const files = {};
  for (const [rel, f] of Object.entries(json.files || {})) {
    if (!keep(rel)) continue;
    const out = pick(f, FILE_KEYS);
    for (const k of ['imports', 'importedBy', 'refs', 'referencedBy', 'tests']) {
      if (out[k]) out[k] = out[k].filter(keep);
      if (out[k] && !out[k].length) delete out[k];
    }
    if (f.symbols?.length) out.symbols = f.symbols.map((s) => pick(s, SYMBOL_KEYS));
    files[rel] = out;
  }
  const out = {
    project: json.project || '',
    updated: json.updated || '',
    root: root ? root.replace(/\\/g, '/') : '',
    entryPoints: (json.entryPoints || []).filter((e) => keep(e.rel)),
    files,
  };
  if (components?.components?.length) {
    const { byFile } = assign(components, Object.keys(files));
    for (const [rel, id] of byFile) files[rel].c = id;
    const used = new Set(byFile.values());
    out.components = [...components.components, OTHER].filter((c) => used.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, description: c.description || '', layer: c.layer || '' }));
    out.links = (components.links || []).filter((l) => used.has(l.from) && used.has(l.to) && l.label);
  }
  if (tour?.stops?.length) {
    const stops = tour.stops.filter((s) => files[s.file]).map((s) => pick(s, ['file', 'line', 'symbol', 'title', 'why']));
    if (stops.length) out.tour = { drafted: !!tour.drafted, stops };
  }
  if (sources) {
    out.src = Object.fromEntries(Object.entries(sources.text).filter(([rel]) => files[rel]));
    out.stale = sources.stale.filter((rel) => files[rel]);
  }
  if (diff) {
    // Deleted files are listed by name only; other changes only for files on the page.
    const changed = Object.entries(diff.files).filter(([rel, d]) => (d.status === 'deleted' ? !isSkipped(rel) : files[rel]));
    out.diff = { ref: diff.ref, sha: diff.sha, files: Object.fromEntries(changed) };
  }
  return out;
}

export function buildMapPage(json, opts = {}) {
  const data = pageData(json, opts);
  // Safe inside <script type="application/json">: no "</script" or "<!--" can close it.
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');
  const zoom = fs.existsSync(ZOOM) ? `<script>\n${fs.readFileSync(ZOOM, 'utf8')}</script>` : '';
  // One pass, so a {{...}} inside the inlined code or data is never replaced.
  const fill = { TITLE: esc(`${data.project || 'Project'} map`), DATA: dataJson, ZOOM: zoom };
  return fs.readFileSync(TEMPLATE, 'utf8').replace(/\{\{(TITLE|DATA|ZOOM)\}\}/g, (_, k) => fill[k]);
}
