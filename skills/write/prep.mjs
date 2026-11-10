// Token savers for /write. The model never types the user's text back:
//   split():  markdown -> skeleton drafts (parts, sentences, option A, heading, sep) + flags
//   merge():  skeleton + the model's options file -> full drafts.json
//   check():  terms dropped or added, catalogue words, per option
//   textOf(): the picked text, as the page's Copy text gives it
// CLI lives in render-page.mjs. No dependencies.

// Same regex as write-page.html (render-page.test.mjs keeps them equal).
export const TERM_RE = /\b(?:MUST NOT|MUST|SHOULD NOT|SHOULD|MAY|REQUIRED|SHALL NOT|SHALL|OPTIONAL)\b|\b[A-Za-z]+_[A-Za-z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b|\w+(?:->|::)\w+|\b\d[\d.,]*%?|\[\d+(?:[,–-]\s*\d+)*\]|\\cite\{[^}]+\}|`[^`]+`/g;
export const LONG = 25; // words; longer sentences get flagged

export function terms(t, keep = []) {
  const out = new Set((t.match(TERM_RE) || []).map((x) => x.replace(/[.,]$/, '')));
  keep.forEach((k) => { if (t.includes(k)) out.add(k); });
  return out;
}

const escRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const lexRe = (lex) => (lex.length ? new RegExp('\\b(' + lex.map(escRe).join('|') + ')\\b', 'gi') : null);
const hits = (re, t) => (re ? [...new Set((t.match(re) || []).map((x) => x.toLowerCase()))] : []);
const words = (t) => (t.match(/\S+/g) || []).length;

// ---- sentences: split after . ! ? outside inline code, not after common abbreviations or initials.
const ABBR = /(?:\b(?:e\.g|i\.e|etc|vs|cf|al|approx|Fig|Figs|Eq|Eqs|Sec|Ch|No|Nos|Dr|Mr|Ms|Mrs|St|Jr|Sr)\.|\b[A-Z]\.)$/;
// pieces(): [{ text, gap }], gap = the exact whitespace before the sentence. Text keeps its own
// line breaks, so an unchanged sentence copies back byte for byte. Boundaries: . ! ? then a space
// and a capital, digit or quote; or . ! ? ) ] : at a line end when the next line does not start lowercase.
export function pieces(text) {
  const out = [];
  let start = 0, ticks = 0, gap = '';
  const push = (end) => { const t = text.slice(start, end).trim(); if (t) out.push({ text: t, gap }); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '`') ticks++;
    if (ticks % 2 || !/[.!?)\]:]/.test(c)) continue;
    let j = i + 1;
    while (j < text.length && /["'”’)\]*_]/.test(text[j])) j++;
    if (!/\s/.test(text[j] || '')) continue;
    let k = j;
    while (k < text.length && /\s/.test(text[k])) k++;
    if (k >= text.length) continue;
    const nl = text.slice(j, k).includes('\n');
    if (/[.!?]/.test(c) ? !nl && !/[A-Z0-9"'“‘(\[`*_]/.test(text[k]) : !nl || /[a-z]/.test(text[k])) continue;
    if (c === '.' && ABBR.test(text.slice(start, i + 1))) continue;
    push(j);
    gap = text.slice(j, k);
    start = k;
    i = k - 1;
  }
  push(text.length);
  return out;
}
export const sentences = (text) => pieces(text).map((p) => p.text);

// ---- split: markdown -> parts. Headings start parts; code, tables, quotes, html and front matter lock.
const HEAD = /^#{1,6}\s/;
const FENCE = /^\s*(```|~~~)/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const LOCKLINE = /^(\s*\||\s*>|\s*<[a-zA-Z!/]|\s{4,}\S|\t|\s*([-*_])(\s*\2){2,}\s*$)/;

export function split(src, { lex = [], all = false, title } = {}) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const parts = [];
  // blanks: blank lines since the last block. brk(): the text between that block and the next.
  let head = null, label = '', cur = null, blanks = 0, n = 0;
  const brk = () => (parts.length || cur || head ? '\n'.repeat(blanks + 1) : '\n'.repeat(blanks));
  const id = () => 'p' + ++n;
  const open = (kind) => {
    const p = { id: id(), heading: '', label, kind };
    if (head) { p.heading = head.line; if (head.gap !== (parts.length ? '\n\n' : '')) p.gap = head.gap; const h = brk(); if (h !== '\n\n') p.hgap = h; head = null; }
    else { const g = brk(); if (g !== (parts.length ? '\n\n' : '')) p.gap = g; }
    return p;
  };
  const flush = () => { if (cur?.sentences.length) parts.push(cur); cur = null; };
  const lock = (text, tag) => { flush(); parts.push({ ...open('locked'), ...(tag && { tag }), text }); blanks = 0; };
  const add = (text, mark = '') => {
    const lead = cur ? brk() : '';
    if (!cur) cur = { ...open('text'), sentences: [] };
    pieces(text).forEach((x, i) => cur.sentences.push({ sep: i ? x.gap : lead + mark, options: [{ text: x.text }] }));
    blanks = 0;
  };

  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) { lock(lines.slice(0, end + 1).join('\n'), 'front matter'); i = end + 1; }
  }
  for (; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { blanks++; i++; continue; }
    if (HEAD.test(line)) {
      flush();
      const gap = brk();
      if (head) lock('');
      head = { line, gap }; label = line.replace(/^#+\s*/, ''); blanks = 0; i++; continue;
    }
    if (FENCE.test(line)) {
      const f = FENCE.exec(line)[1];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(f)) j++;
      lock(lines.slice(i, j + 1).join('\n'), 'code'); i = j + 1; continue;
    }
    const item = !/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) && ITEM.exec(line);
    if (item) {
      let text = item[3], j = i + 1;
      while (j < lines.length && lines[j].trim() && !ITEM.test(lines[j]) && /^\s+/.test(lines[j]) && !FENCE.test(lines[j])) text += '\n' + lines[j++];
      add(text, line.slice(0, line.length - item[3].length));
      i = j; continue;
    }
    if (LOCKLINE.test(line) && !(cur && /^\s{4,}\S/.test(line) && !blanks)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && LOCKLINE.test(lines[j])) j++;
      lock(lines.slice(i, j).join('\n'), { '|': 'table', '>': 'quote', '<': 'html' }[line.trim()[0]] || 'code'); i = j; continue;
    }
    let text = line, j = i + 1;
    while (j < lines.length && lines[j].trim() && !HEAD.test(lines[j]) && !FENCE.test(lines[j]) && !ITEM.test(lines[j]) && !LOCKLINE.test(lines[j])) text += '\n' + lines[j++];
    add(text.trimStart(), /^\s*/.exec(line)[0]);
    i = j;
  }
  flush();
  if (head) lock('');
  const tail = '\n'.repeat(Math.max(0, blanks - 1) + (src.endsWith('\n') ? 1 : 0));

  const re = lexRe(lex);
  const flagged = [];
  for (const p of parts) {
    if (p.kind !== 'text') continue;
    p.sentences.forEach((s, k) => {
      const t = s.options[0].text, why = [];
      const h = hits(re, t);
      if (h.length) why.push('ai: ' + h.join(', '));
      if (words(t) > LONG) why.push('long');
      if (all && !why.length) why.push('all');
      if (why.length) flagged.push({ ref: `${p.id}.${k + 1}`, label: p.label, why, text: t });
    });
  }
  const sentenceCount = parts.reduce((a, p) => a + (p.sentences?.length || 0), 0);
  const skeleton = { title: title || (parts.find((p) => /^# /.test(p.heading))?.label) || 'Draft', parts };
  if (tail !== '\n') skeleton.tail = tail;
  if (src.includes('\r\n')) skeleton.eol = '\r\n'; // textOf and the page write CRLF back
  return { skeleton, flagged, sentenceCount };
}

// Compact list for the model: only the sentences that need options.
export function report({ flagged, sentenceCount, skeleton }) {
  const out = [`${sentenceCount} sentences in ${skeleton.parts.length} parts, ${flagged.length} flagged. Write options for the flagged ones (ref: text).`];
  let last;
  for (const f of flagged) {
    if (f.label !== last) { out.push(`## ${f.label || '(top)'}`); last = f.label; }
    out.push(`${f.ref} [${f.why.join('; ')}] ${f.text.replace(/\s*\n\s*/g, ' ')}`);
  }
  return out.join('\n') + '\n';
}

// ---- merge: the model's options file onto the skeleton.
// opts: { title?, register?, mode?, style?, rules?, keep?, samples?, style_notes?,
//         options: { "p2.1": [{ text, tone }] }, pick?: { "p2.1": 0 }, lock?: ["p4"] }
export function merge(skeleton, opts) {
  const { options = {}, pick = {}, lock = [], ...meta } = opts;
  const d = { ...meta, title: meta.title || skeleton.title, parts: structuredClone(skeleton.parts) };
  const byRef = new Map();
  for (const p of d.parts) if (p.kind === 'text') p.sentences.forEach((s, k) => byRef.set(`${p.id}.${k + 1}`, s));
  for (const ref of [...Object.keys(options), ...Object.keys(pick)]) if (!byRef.has(ref)) throw new Error(`options: no sentence "${ref}" in the skeleton`);
  for (const [ref, list] of Object.entries(options)) {
    const s = byRef.get(ref);
    for (const o of list) s.options.push({ from: 'A', ...o });
    s.pick = 1;
  }
  for (const [ref, k] of Object.entries(pick)) byRef.get(ref).pick = k;
  for (const pid of lock) {
    const at = d.parts.findIndex((p) => p.id === pid);
    if (at < 0) throw new Error(`lock: no part "${pid}"`);
    const p = d.parts[at];
    if (p.kind === 'text') d.parts[at] = { ...(({ sentences, ...rest }) => rest)(p), kind: 'locked', text: p.sentences.map((s, k) => (s.sep ?? (k ? ' ' : '')) + s.options[0].text).join('') };
  }
  return d;
}

// ---- check: per new option, terms dropped (error) or added, and catalogue words A did not have (warn).
// Fills empty `tells` with the catalogue words found.
export function check(d, lex = []) {
  const re = lexRe(lex), keep = d.keep || [], errors = [], warnings = [];
  if (d.from_scratch) return { errors, warnings };
  for (const p of d.parts) {
    if (p.kind !== 'text') continue;
    p.sentences.forEach((s, k) => {
      const a = s.options[0].text, ta = terms(a, keep), la = new Set(hits(re, a));
      s.options.slice(1).forEach((o, j) => {
        const at = `${p.id}.${k + 1} ${String.fromCharCode(66 + j)}`;
        const to = terms(o.text, keep);
        const miss = [...ta].filter((x) => !to.has(x)), add = [...to].filter((x) => !ta.has(x));
        const lw = hits(re, o.text);
        if (!o.tells?.length && lw.length) o.tells = lw;
        if (miss.length) errors.push(`${at}: missing ${miss.join(', ')}`);
        if (add.length) warnings.push(`${at}: added ${add.join(', ')}`);
        const newLw = lw.filter((w) => !la.has(w));
        if (newLw.length) warnings.push(`${at}: catalogue words ${newLw.join(', ')}`);
      });
    });
  }
  return { errors, warnings };
}

// ---- textOf: same output as the page's Copy text with the default picks.
export function textOf(d) {
  const fileMode = d.parts.some((p) => p.heading != null);
  const body = (p) => (p.kind !== 'text' ? p.text : p.sentences.map((s, i) => {
    const k = s.pick ?? Math.min(1, s.options.length - 1);
    return (s.sep ?? (i ? ' ' : '')) + s.options[Math.max(0, Math.min(k, s.options.length - 1))].text;
  }).join(''));
  if (!fileMode) {
    const head = (p) => (p.num ? p.num + ' ' : '') + (p.label || '');
    return (d.title || 'Draft') + '\n\n' + d.parts.map((p) => [head(p), body(p)].filter(Boolean).join('\n\n')).join('\n\n');
  }
  // File mode: gap before each part, hgap between heading and body, tail at the end.
  const out = d.parts.map((p, i) => (p.gap ?? (i ? '\n\n' : '')) + (p.heading ? p.heading + (body(p) ? (p.hgap ?? '\n\n') : '') : '') + body(p)).join('') + (d.tail ?? '\n');
  return d.eol === '\r\n' ? out.replace(/\r?\n/g, '\r\n') : out;
}
