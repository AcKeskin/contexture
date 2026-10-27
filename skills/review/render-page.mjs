#!/usr/bin/env node
// Render a review page from findings.json (see findings-schema.md).
//   node render-page.mjs <findings.json> [out.html] [--artifact]
// Default out: next to the input, same name with .html. No dependencies.
// --artifact: for publishing as a Claude artifact, which draws mermaid itself.
// Without it the page loads mermaid from cdnjs so a local file shows diagrams.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEVS = ['critical', 'high', 'medium', 'low'];
const here = dirname(fileURLToPath(import.meta.url));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// Paragraphs, "- " bullets and `code`. Nothing else.
function text(src) {
  if (!src) return '';
  return String(src).split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*- /.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*- /, ''))}</li>`).join('') + '</ul>';
    }
    return `<p>${inline(block)}</p>`;
  }).join('');
}

const loc = (o) => (o.file ? `${o.file}${o.line ? ':' + o.line : ''}` : '');
const mermaid = (blocks = [], caption) => blocks.map((m) =>
  `<figure><div class="fw"><pre class="mermaid">${esc(m)}</pre></div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`).join('');

function pickControls(id, kind) {
  const opts = kind === 'tension'
    ? [['a', 'Side A'], ['b', 'Side B'], ['skip', 'Leave open']]
    : [['kept', 'Keep'], ['dropped', 'Drop'], ['wontfix', "Won't fix"]];
  const input = kind === 'tension' ? '' : `<input id="reason-${esc(id)}" type="text" placeholder="Why won't you fix it?" aria-label="Won't-fix reason for ${esc(id)}" hidden>`;
  return `<div class="pick" data-id="${esc(id)}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}${input}</div>`;
}

function card(f) {
  const angles = (f.angles && f.angles.length ? f.angles : [f.category]).filter(Boolean);
  const detail = [
    f.chain?.length ? `<div class="k">Call path the reviewer followed</div><ol class="chain">${f.chain.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : '',
    f.quote ? `<div class="k">Code at ${esc(loc(f))}</div><pre class="code">${esc(f.quote)}</pre>` : '',
    f.what ? `<div class="k">Detail</div>${text(f.what)}` : '',
    f.fix ? `<div class="k">Fix</div>${text(f.fix)}` : '',
    f.suggestion ? `<pre class="code">${esc(f.suggestion)}</pre>` : '',
    f.verifier ? `<div class="k">Verifier</div>${text(f.verifier)}` : '',
    f.notes?.length ? `<div class="k">Notes from the walk</div><ul>${f.notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ul>` : '',
  ].join('');
  return `<article class="card" id="${esc(f.id)}" data-kind="finding" data-sev="${esc(f.severity)}" data-severity="${esc(f.severity)}" data-angle="${esc(angles.join(' '))}" data-status="${esc(f.status || 'open')}">
  <div class="head"><span class="id">${esc(f.id)}</span><span class="sev">${esc(f.severity)}</span><span class="title">${inline(f.title)}</span></div>
  ${f.impact ? `<p class="impact">${inline(f.impact)}</p>` : ''}
  <div class="meta"><span>${esc(loc(f))}</span>${angles.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}${f.verdict ? `<span class="tag v-${esc(f.verdict)}">${esc(f.verdict)}</span>` : ''}${f.effort ? `<span class="tag">effort ${esc(f.effort)}</span>` : ''}</div>
  ${detail ? `<details><summary>Code and call path</summary><div class="detail">${detail}</div></details>` : ''}
  ${pickControls(f.id, 'finding')}
</article>`;
}

function tension(t) {
  const [a, b] = t.sides || [];
  const side = (s, n) => s ? `<div class="side"><div class="k">Side ${n} · ${esc(s.angle)}</div>${text(s.say)}</div>` : '';
  return `<article class="card" id="${esc(t.id)}" data-kind="tension">
  <div class="head"><span class="id">${esc(t.id)}</span><span class="title">${esc(loc(t))}</span></div>
  <div class="sides">${side(a, 'A')}${side(b, 'B')}</div>
  ${t.settle ? `<p><b>Settles it:</b> ${inline(t.settle)}</p>` : ''}
  ${pickControls(t.id, 'tension')}
</article>`;
}

function filterGroup(label, group, values) {
  if (values.length < 2) return '';
  const chips = ['all', ...values].map((v, i) => `<button type="button" class="chip" data-group="${group}" data-value="${esc(v)}" aria-pressed="${i === 0}">${esc(v)}</button>`).join('');
  return `<div class="filters"><span class="lbl">${label}</span>${chips}</div>`;
}

const MERMAID_LOCAL = `<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<script>try{mermaid.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"});}catch(e){}</script>`;

function render(d, { artifact = false } = {}) {
  const run = d.run || {};
  const findings = d.findings || [];
  const tensions = d.tensions || [];
  const sections = d.pack?.sections || [];
  const angles = [...new Set(findings.flatMap((f) => (f.angles?.length ? f.angles : [f.category]).filter(Boolean)))];
  const pages = [];

  // Overview: metrics and the picture first; detail lives on the other tabs.
  const count = (s, a) => findings.filter((f) => f.severity === s && (!a || (f.angles?.length ? f.angles : [f.category]).includes(a))).length;
  const matrix = findings.length && angles.length ? `<h3>Findings by angle</h3><div class="tw"><table><thead><tr><th>Angle</th>${SEVS.map((s) => `<th class="num">${s}</th>`).join('')}</tr></thead><tbody>${angles.map((a) => `<tr><td>${esc(a)}</td>${SEVS.map((s) => `<td class="num">${count(s, a)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const urgent = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const calls = urgent.length || tensions.length ? `<h3>Needs your call</h3><ul>${urgent.map((f) => `<li><a href="#${esc(f.id)}">${esc(f.id)}</a> ${inline(f.impact || f.title)}</li>`).join('')}${tensions.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.id)}</a> trade-off: ${esc(t.sides?.map((s) => s.angle).join(' vs '))} at ${esc(loc(t))}</li>`).join('')}</ul>` : '';
  const structure = sections.find((s) => s.id === 'structure');
  pages.push(['overview', 'Overview', `
  <p class="lede">${inline(d.pack?.summary || run.scope || '')}</p>
  ${d.metrics?.length ? `<div class="tiles">${d.metrics.map((m) => `<div class="tile"><span class="k">${esc(m.label)}</span><span class="v">${esc(m.value)}</span>${m.note ? `<span class="n">${inline(m.note)}</span>` : ''}${m.source ? `<span class="s">from ${esc(m.source)}</span>` : ''}</div>`).join('')}</div>` : ''}
  ${calls}
  ${structure?.mermaid?.length ? `<h3>Where the change sits</h3>${mermaid(structure.mermaid.slice(0, 1))}` : ''}
  ${matrix}`]);

  pages.push(['findings', `Findings (${findings.length})`, findings.length
    ? `${filterGroup('Severity', 'severity', SEVS.filter((s) => count(s)))}${filterGroup('Angle', 'angle', angles)}${filterGroup('Status', 'status', [...new Set(findings.map((f) => f.status || 'open'))])}<div class="cards">${findings.map(card).join('')}</div>`
    : '<p>No findings.</p>']);

  if (tensions.length) pages.push(['tensions', `Trade-offs (${tensions.length})`, `<p class="lede">Two angles disagree on the same code. Pick a side or leave it open.</p><div class="cards">${tensions.map(tension).join('')}</div>`]);

  for (const s of sections) pages.push([`pack-${s.id}`, s.title, `${text(s.text)}${mermaid(s.mermaid, s.id === 'call-flow' ? 'Static call order read from the code, not a runtime trace.' : '')}`]);

  const cov = d.coverage?.length ? `<h3>Angles</h3><div class="tw"><table><thead><tr><th>Angle</th><th>Status</th><th>Files</th><th>Findings</th><th>Note</th></tr></thead><tbody>${d.coverage.map((c) => `<tr><td>${esc(c.angle)}</td><td>${esc(c.status)}</td><td class="num">${esc(c.files ?? '')}</td><td class="num">${esc(c.findings ?? '')}</td><td>${esc(c.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
  const nv = d.needs_validation?.length ? `<h3>Needs validation</h3><ul>${d.needs_validation.map((n) => `<li><code>${esc(loc(n))}</code> ${inline(n.claim)}. Gap: ${inline(n.gap)}. To settle: ${inline(n.settle)}</li>`).join('')}</ul>` : '';
  const fine = d.fine?.length ? `<h3>Looks bad but is fine</h3><ul>${d.fine.map((n) => `<li><code>${esc(loc(n))}</code> ${inline(n.why)}</li>`).join('')}</ul>` : '';
  if (cov || nv || fine) pages.push(['coverage', 'Coverage', cov + nv + fine]);

  const header = `<div class="run"><b>${esc(run.title || 'Review')}</b>${[run.scope, run.base && run.head ? `${run.base} ← ${run.head}` : '', run.date, run.verdict ? `verdict ${run.verdict}` : ''].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}${run.url ? `<span><a href="${esc(run.url)}" style="color:inherit">open on GitHub</a></span>` : ''}</div>`;
  const tabs = pages.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('');
  const body = pages.map(([id, label, html], i) => `<section class="page" id="${id}"${i ? ' hidden' : ''}><h2>${esc(label.replace(/ \(\d+\)$/, ''))}</h2>${html}</section>`).join('\n');
  // Keep "</script" out of the embedded JSON.
  const json = JSON.stringify(d).replace(/</g, '\\u003c');

  const tpl = readFileSync(join(here, 'assets', 'review-page.html'), 'utf8');
  return tpl.replace('{{TITLE}}', () => esc(run.title || 'Review'))
    .replace('{{HEADER}}', () => header).replace('{{TABS}}', () => tabs)
    .replace('{{BODY}}', () => body).replace('{{DATA}}', () => json)
    .replace('{{MERMAID}}', () => (artifact ? '' : MERMAID_LOCAL));
}

const args = process.argv.slice(2);
const artifact = args.includes('--artifact');
const [input, output] = args.filter((a) => a !== '--artifact');
if (!input) {
  console.error('usage: node render-page.mjs <findings.json> [out.html] [--artifact]');
  process.exit(2);
}
const out = output || join(dirname(input), basename(input).replace(/\.json$/, '') + '.html');
writeFileSync(out, render(JSON.parse(readFileSync(input, 'utf8')), { artifact }));
console.log(out);
