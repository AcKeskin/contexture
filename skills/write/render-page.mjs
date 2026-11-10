#!/usr/bin/env node
// Render the write page from drafts.json (see drafts-schema.md). No dependencies.
//   node render-page.mjs --split <file.md> [--all]   skeleton + flagged sentences (prep.mjs)
//   node render-page.mjs <tmp.json> --save <slug> [--force]
//   node render-page.mjs <tmp.json> --text [--force]  picked text only, no page
//   node render-page.mjs <drafts.json> [out.html]
// --split writes .write-run.skel.json at the project root and prints only the flagged
// sentences, so the model never types the text back. A tmp.json with `options` is merged
// onto that skeleton. Options are checked first: a dropped term stops the run unless --force.
// --save: Claude Code blocks Write/Edit under .claude/, so this copies the result to
// .claude/writes/<slug>/v<N>.json + v<N>.html (N = next free) and deletes the temp files.
// Adds `lexicon` from section A of the newest references/ai-vocabulary.v<N>.md,
// parsed the same way as hooks/prose-lint.js.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { split, report, merge, check, textOf } from './prep.mjs';

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
  if (d.tail !== undefined && typeof d.tail !== 'string') throw new Error('drafts.json: "tail" must be a string');
  if (d.eol !== undefined && d.eol !== '\r\n') throw new Error('drafts.json: "eol" can only be "\\r\\n"');
  const ids = new Set();
  d.parts.forEach((p, i) => {
    const at = `parts[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (!p.id || ids.has(p.id)) throw new Error(`${at}: needs a unique "id"`);
    ids.add(p.id);
    for (const k of ['heading', 'gap', 'hgap']) if (p[k] !== undefined && typeof p[k] !== 'string') throw new Error(`${at}: "${k}" must be a string`);
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

export const SKEL = '.write-run.skel.json';

// Read the model's file; merge it onto the skeleton when it has `options`, `pick` or `lock`.
export function load(input, root = process.cwd()) {
  const d = JSON.parse(readFileSync(input, 'utf8'));
  const temps = [input];
  if (!d.parts) {
    const skel = join(dirname(input), SKEL);
    if (!existsSync(skel)) throw new Error(`no "parts" and no ${SKEL}: run --split first`);
    temps.push(skel);
    Object.assign(d, merge(JSON.parse(readFileSync(skel, 'utf8')), d));
    for (const k of ['options', 'pick', 'lock']) delete d[k];
  }
  if (Array.isArray(d.like)) {
    d.samples = [...(d.samples || []), ...d.like.map((f) => ({ title: f, text: readFileSync(resolve(root, f), 'utf8').slice(0, 4000) }))];
    delete d.like;
  }
  return { d, temps };
}

function checked(d, force, lex) {
  validate(d);
  const { errors, warnings } = check(d, lex);
  if (errors.length && !force) throw new Error(`options drop terms (fix them, or rerun with --force):\n${errors.join('\n')}`);
  return [...errors, ...warnings];
}

export function save(input, slug, root = process.cwd(), { force = false, lex = lexicon() } = {}) {
  if (!slug || /[\\/]|\.\./.test(slug)) throw new Error('--save needs a slug without slashes or ..');
  const { d, temps } = load(input, root);
  const notes = checked(d, force, lex);
  const html = render(d, { lex });
  const dir = join(root, '.claude', 'writes', slug);
  mkdirSync(dir, { recursive: true });
  const n = nextVersion(dir);
  const json = join(dir, `v${n}.json`), page = join(dir, `v${n}.html`);
  writeFileSync(json, JSON.stringify(d, null, 1));
  writeFileSync(page, html);
  temps.forEach((f) => rmSync(f, { force: true }));
  return { paths: [json, page], notes };
}

export function text(input, root = process.cwd(), { force = false, lex = lexicon() } = {}) {
  const { d, temps } = load(input, root);
  const notes = checked(d, force, lex);
  temps.forEach((f) => rmSync(f, { force: true }));
  return { text: textOf(d), notes };
}

export function splitFile(src, root = process.cwd(), { all = false, lex = lexicon() } = {}) {
  const r = split(readFileSync(src, 'utf8'), { lex, all, title: basename(src).startsWith('.write-run.') ? undefined : basename(src) });
  writeFileSync(join(root, SKEL), JSON.stringify(r.skeleton));
  if (basename(src).startsWith('.write-run.')) rmSync(src, { force: true });
  return report(r);
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, arity = 0) => { const at = args.indexOf(name); if (at < 0) return null; return args.splice(at, arity + 1)[arity] ?? ''; };
  const force = flag('--force') != null, all = flag('--all') != null, asText = flag('--text') != null;
  const src = flag('--split', 1), slug = flag('--save', 1);
  const [input, output] = args;
  if ((src == null && !input) || src === '' || slug === '') {
    process.stderr.write('usage: node render-page.mjs --split <file> [--all] | <tmp.json> --save <slug> | <tmp.json> --text | <drafts.json> [out.html]\n');
    process.exit(2);
  }
  const notes = (n) => (n.length ? n.join('\n') + '\n' : '');
  try {
    if (src != null) return void process.stdout.write(splitFile(src, process.cwd(), { all }));
    if (slug != null) {
      const r = save(input, slug, process.cwd(), { force });
      return void process.stdout.write(r.paths.join('\n') + '\n' + notes(r.notes));
    }
    if (asText) {
      const r = text(input, process.cwd(), { force });
      return void process.stdout.write(r.text + (r.notes.length ? '\n---\n' + notes(r.notes) : ''));
    }
    const out = output || join(dirname(input), basename(input).replace(/\.json$/, '') + '.html');
    writeFileSync(out, render(JSON.parse(readFileSync(input, 'utf8'))));
    process.stdout.write(`${out}\n`);
  } catch (e) {
    process.stderr.write(`not rendered: ${e.message}\n`);
    process.exit(1);
  }
}

// realpath: skills are often installed as symlinks, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
