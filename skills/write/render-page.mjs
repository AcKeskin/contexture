#!/usr/bin/env node
// Render the write page from drafts.json (see drafts-schema.md).
//   node render-page.mjs <drafts.json> [out.html]
//   node render-page.mjs <tmp.json> --save <slug>
// Default out: next to the input, same name with .html. No dependencies.
// --save: Claude Code blocks Write/Edit under .claude/, so the skill writes
// .write-run.tmp.json at the project root and this copies it to
// .claude/writes/<slug>/v<N>.json + v<N>.html (N = next free), then deletes it.
// Adds `lexicon` from section A of the newest references/ai-vocabulary.v<N>.md,
// parsed the same way as hooks/prose-lint.js.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function lexicon(dir = join(here, 'references')) {
  const files = readdirSync(dir).filter((f) => /^ai-vocabulary\.v\d+\.md$/.test(f))
    .sort((a, b) => Number(/v(\d+)/.exec(b)[1]) - Number(/v(\d+)/.exec(a)[1]));
  if (!files.length) return [];
  const text = readFileSync(join(dir, files[0]), 'utf8');
  const sectionA = (/## A\.[\s\S]*?(?=\n## )/.exec(text) || [''])[0];
  const terms = new Set();
  for (const line of sectionA.split('\n')) {
    const m = /^\*\*[^*]+:\*\*\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const body = m[1].split(/\.\s+[A-Z]/)[0];
    for (let item of body.split(',')) {
      item = item.split('→')[0].replace(/\([^)]*\)/g, '').replace(/["“”.…]/g, '').trim().toLowerCase();
      for (const alt of item.split('/')) {
        const t = alt.trim();
        if (t && t.length > 2 && !/\s(the|of)$|\s\s/.test(t)) terms.add(t);
      }
    }
  }
  return [...terms];
}

// Throws with a message that names the bad part, so the skill can fix drafts.json.
export function validate(d) {
  if (!d || !Array.isArray(d.parts) || !d.parts.length) throw new Error('drafts.json: "parts" must be a non-empty array');
  const ids = new Set();
  d.parts.forEach((p, i) => {
    const at = `parts[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (!p.id || ids.has(p.id)) throw new Error(`${at}: needs a unique "id"`);
    ids.add(p.id);
    if (p.heading !== undefined && typeof p.heading !== 'string') throw new Error(`${at}: "heading" must be a string`);
    if (p.kind === 'locked') {
      if (typeof p.text !== 'string') throw new Error(`${at}: locked part needs "text"`);
      return;
    }
    if (p.kind !== 'text') throw new Error(`${at}: "kind" must be "text" or "locked"`);
    if (!Array.isArray(p.sentences) || !p.sentences.length) throw new Error(`${at}: needs "sentences"`);
    p.sentences.forEach((s, j) => {
      if (!Array.isArray(s.options) || !s.options.length || s.options.some((o) => typeof o?.text !== 'string' || !o.text.trim())) {
        throw new Error(`${at}.sentences[${j}]: needs "options", each with non-empty "text"`);
      }
      if (s.sep !== undefined && typeof s.sep !== 'string') throw new Error(`${at}.sentences[${j}]: "sep" must be a string`);
    });
  });
  return d;
}

export function render(d, { lex = lexicon() } = {}) {
  validate(d);
  const data = { ...d, lexicon: d.lexicon || lex };
  // Inside <script>: escape "<" so text like "</script>" in a draft cannot end the block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const tpl = readFileSync(join(here, 'assets', 'write-page.html'), 'utf8');
  return tpl.replace('{{TITLE}}', () => esc(d.title || 'Draft')).replace('{{DATA}}', () => json);
}

// Next free v<N> in dir.
export function nextVersion(dir) {
  if (!existsSync(dir)) return 1;
  const ns = readdirSync(dir).map((f) => /^v(\d+)\.json$/.exec(f)).filter(Boolean).map((m) => Number(m[1]));
  return ns.length ? Math.max(...ns) + 1 : 1;
}

export function save(input, slug, root = process.cwd()) {
  if (!slug || /[\\/]|\.\./.test(slug)) throw new Error('--save needs a slug without slashes or ..');
  const text = readFileSync(input, 'utf8');
  const html = render(JSON.parse(text));
  const dir = join(root, '.claude', 'writes', slug);
  mkdirSync(dir, { recursive: true });
  const n = nextVersion(dir);
  const json = join(dir, `v${n}.json`), page = join(dir, `v${n}.html`);
  writeFileSync(json, text);
  writeFileSync(page, html);
  rmSync(input);
  return [json, page];
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--save');
  const slug = at >= 0 ? args.splice(at, 2)[1] : null;
  const [input, output] = args;
  if (!input || (at >= 0 && !slug)) {
    process.stderr.write('usage: node render-page.mjs <drafts.json> [out.html] | <tmp.json> --save <slug>\n');
    process.exit(2);
  }
  try {
    if (slug) {
      process.stdout.write(save(input, slug).join('\n') + '\n');
      return;
    }
    const out = output || join(dirname(input), basename(input).replace(/\.json$/, '') + '.html');
    writeFileSync(out, render(JSON.parse(readFileSync(input, 'utf8'))));
    process.stdout.write(`${out}\n`);
  } catch (e) {
    process.stderr.write(`not rendered: ${e.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
