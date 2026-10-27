#!/usr/bin/env node
// Obsidian note from findings.json (see findings-schema.md), and picks back from it.
//   node render-note.mjs <findings.json> [out.md] [--body-only]
//   node render-note.mjs --read-picks <note.md>     # prints the pick line
// --body-only: no frontmatter (iteration-N.md bodies). No dependencies.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const SEVS = ['critical', 'high', 'medium', 'low'];
const loc = (o) => (o.file ? `${o.file}${o.line ? ':' + o.line : ''}` : '');
const quote = (s) => String(s).split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
const fence = (s, lang = '') => '```' + lang + '\n' + String(s).replace(/\n$/, '') + '\n```';
const one = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const anglesOf = (f) => (f.angles?.length ? f.angles : [f.category]).filter(Boolean);
const heading = (f) => `${f.id} · ${f.severity} · ${one(f.title)}`.replace(/[#|[\]^]/g, '');

function yamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return '[' + v.map(yamlValue).join(', ') + ']';
  return JSON.stringify(String(v));
}

function frontmatter(d) {
  const run = d.run || {};
  const fs = d.findings || [];
  const by = (k, v) => fs.filter((f) => (f[k] || 'open') === v).length;
  const fm = {
    ...(run.frontmatter || {}), // the caller's own keys (review SKILL.md §10) come first
    review: run.target || 'local',
    date: run.date,
    ...(run.verdict ? { verdict: run.verdict } : {}),
    angles: [...new Set(fs.flatMap(anglesOf))],
    findings: fs.length,
    ...Object.fromEntries(SEVS.map((s) => [s, fs.filter((f) => f.severity === s).length])),
    open: by('status', 'open'), kept: by('status', 'kept'), dropped: by('status', 'dropped'), wontfix: by('status', 'wontfix'),
    tensions: (d.tensions || []).length,
  };
  for (const m of d.metrics || []) fm[`metric_${String(m.id).replace(/[^a-z0-9_]/gi, '_')}`] = m.value;
  return '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${yamlValue(v)}`).join('\n') + '\n---\n\n';
}

const box = (label, checked) => `- [${checked ? 'x' : ' '}] ${label}`;

function finding(f) {
  const st = f.status || 'open';
  const detail = [
    f.chain?.length ? '**Call path**\n' + f.chain.map((c, i) => `${i + 1}. \`${c}\``).join('\n') : '',
    f.quote ? `**Code** at \`${loc(f)}\`\n` + fence(f.quote) : '',
    f.what ? `**Detail**\n${f.what}` : '',
    f.fix ? `**Fix**\n${f.fix}` : '',
    f.suggestion ? fence(f.suggestion, 'suggestion') : '',
    f.verifier ? `**Verifier**\n${f.verifier}` : '',
    f.notes?.length ? '**Notes from the walk**\n' + f.notes.map((n) => `- ${n}`).join('\n') : '',
  ].filter(Boolean).join('\n\n');
  return [
    `### ${heading(f)}`,
    f.impact ? one(f.impact) : '',
    [`\`${loc(f)}\``, anglesOf(f).join(', '), f.verdict, f.effort ? `effort ${f.effort}` : ''].filter(Boolean).join(' · '),
    [box('keep', st === 'kept'), box('drop', st === 'dropped'), box(`wontfix: ${st === 'wontfix' ? one(f.reason) : ''}`.trimEnd(), st === 'wontfix')].join('\n'),
    detail ? quote('[!example]- Code and call path\n' + detail) : '',
  ].filter(Boolean).join('\n\n');
}

function tension(t) {
  const [a, b] = t.sides || [];
  const st = t.status || 'open';
  const body = [a ? `**A · ${a.angle}:** ${one(a.say)}` : '', b ? `**B · ${b.angle}:** ${one(b.say)}` : '', t.settle ? `**Settles it:** ${one(t.settle)}` : ''].filter(Boolean).join('\n\n');
  return [
    `### ${t.id} · ${(t.sides || []).map((s) => s.angle).join(' vs ')}`,
    `\`${loc(t)}\``,
    quote('[!question] Trade-off\n' + body),
    [box('side A', st === 'a'), box('side B', st === 'b'), box('leave open', st === 'skip')].join('\n'),
  ].join('\n\n');
}

function render(d, { bodyOnly = false } = {}) {
  const run = d.run || {};
  const fs = d.findings || [];
  const ts = d.tensions || [];
  const sections = d.pack?.sections || [];
  const out = [];

  out.push(`# ${run.title || 'Review'}`);
  const sub = [run.scope, run.base && run.head ? `${run.base} ← ${run.head}` : '', run.date, run.verdict ? `verdict ${run.verdict}` : '', run.url ? `[open on GitHub](${run.url})` : '', run.artifact_url ? `[review page](${run.artifact_url})` : ''].filter(Boolean);
  if (sub.length) out.push(sub.join(' · '));
  if (run.verdict && run.verdict_reason) out.push(`**Verdict:** ${run.verdict}. ${one(run.verdict_reason)}`);
  if (d.pack?.summary) out.push(d.pack.summary);

  if (d.metrics?.length) {
    out.push('## Metrics', '| Metric | Value | Note | Source |\n| --- | --- | --- | --- |\n' +
      d.metrics.map((m) => `| ${m.label} | ${one(m.value)} | ${one(m.note)} | ${one(m.source)} |`).join('\n'));
  }

  const urgent = fs.filter((f) => f.severity === 'critical' || f.severity === 'high');
  if (urgent.length || ts.length) {
    out.push('## Needs your call', [
      ...urgent.map((f) => `- [[#${heading(f)}|${f.id}]] ${one(f.impact || f.title)}`),
      ...ts.map((t) => `- [[#${t.id} · ${(t.sides || []).map((s) => s.angle).join(' vs ')}|${t.id}]] trade-off at \`${loc(t)}\``),
    ].join('\n'));
  }

  const structure = sections.find((s) => s.id === 'structure');
  if (structure?.mermaid?.length) out.push('## Where the change sits', fence(structure.mermaid[0], 'mermaid'));

  out.push('## Findings', fs.length ? 'Tick one box per finding, then tell Claude "apply vault picks".' : 'No findings.');
  for (const f of fs) out.push(finding(f));

  if (ts.length) {
    out.push('## Trade-offs', 'Two angles disagree on the same code. Tick a side or leave it open.');
    for (const t of ts) out.push(tension(t));
  }

  if (d.needs_validation?.length) out.push('## Needs validation', d.needs_validation.map((n) => `- \`${loc(n)}\` ${one(n.claim)}. Gap: ${one(n.gap)}. To settle: ${one(n.settle)}`).join('\n'));

  for (const s of sections) {
    out.push(`## ${s.title}`);
    if (s.text) out.push(s.text);
    for (const m of s.mermaid || []) out.push(fence(m, 'mermaid'));
    if (s.id === 'call-flow' && s.mermaid?.length) out.push('*Static call order read from the code, not a runtime trace.*');
  }

  if (d.coverage?.length) {
    out.push('## Coverage', '| Angle | Status | Files | Findings | Note |\n| --- | --- | --- | --- | --- |\n' +
      d.coverage.map((c) => `| ${c.angle} | ${c.status} | ${c.files ?? ''} | ${c.findings ?? ''} | ${one(c.reason)} |`).join('\n'));
  }
  if (d.fine?.length) out.push('## Looks bad but is fine', d.fine.map((n) => `- \`${loc(n)}\` ${one(n.why)}`).join('\n'));

  return (bodyOnly ? '' : frontmatter(d)) + out.join('\n\n') + '\n';
}

// Picks: one ticked box per "### <ID> · …" section. Same line the page's Copy pick builds.
function readPicks(md) {
  const keep = [], drop = [], rest = [];
  for (const part of md.split(/^### /m).slice(1)) {
    const id = part.split(/\s/)[0];
    const ticked = [...part.matchAll(/^- \[[xX]\] (.*)$/gm)].map((m) => m[1].trim());
    if (!ticked.length) continue;
    const t = ticked[0];
    if (t === 'keep') keep.push(id);
    else if (t === 'drop') drop.push(id);
    else if (t.startsWith('wontfix')) rest.push(`wontfix ${id} "${t.replace(/^wontfix:?\s*/, '') || 'reason'}"`);
    else if (t === 'side A') rest.push(`tension ${id} a`);
    else if (t === 'side B') rest.push(`tension ${id} b`);
    else if (t === 'leave open') rest.push(`tension ${id} skip`);
    if (ticked.length > 1) console.error(`${id}: ${ticked.length} boxes ticked, used "${t}"`);
  }
  return [keep.length ? `keep ${keep.join(',')}` : '', drop.length ? `drop ${drop.join(',')}` : '', ...rest].filter(Boolean).join(' · ');
}

const args = process.argv.slice(2);
if (args[0] === '--read-picks' && args[1]) {
  console.log(readPicks(readFileSync(args[1], 'utf8')) || 'no picks ticked');
} else {
  const bodyOnly = args.includes('--body-only');
  const [input, output] = args.filter((a) => a !== '--body-only');
  if (!input) {
    console.error('usage: node render-note.mjs <findings.json> [out.md] [--body-only]\n       node render-note.mjs --read-picks <note.md>');
    process.exit(2);
  }
  const out = output || join(dirname(input), basename(input).replace(/\.json$/, '') + '.md');
  writeFileSync(out, render(JSON.parse(readFileSync(input, 'utf8')), { bodyOnly }));
  console.log(out);
}
