#!/usr/bin/env node
'use strict';

// PostToolUse (Write/Edit/MultiEdit): a plain-English check on user-facing
// Markdown (README, CHANGELOG, CONTRIBUTING, docs/). Advisory, never blocks.
//
// Two signals, both by density, never a single hit (prose-authenticity rule):
//   - words from section A of the write skill's catalogue (ai-vocabulary.v<N>.md):
//     AI lexicon, puffery, long words with a short twin, filler connectives
//   - share of sentences over LONG_SENTENCE words
// Code blocks, inline code, links, tables and front matter are skipped. Text
// under MIN_WORDS words is skipped (near the rule's ~120-word floor). The model corpus (.claude/, skills/,
// rules, memory, plans, CLAUDE.md, AGENTS.md) is out of scope. Em-dashes are
// not counted: the catalogue lists them as a refuted tell.
//
// Reports once per file per session, again only when the numbers change.
// From AminBlg/SimpleEnglish's advisory lint hook (read 2026-11-05). Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const MIN_WORDS = 100;
const LEXICON_PER_1K = 8;
const MIN_LEXICON_HITS = 3;
const LONG_SENTENCE = 30;
const LONG_SHARE = 0.2;
const MIN_LONG = 3;

const USER_DOC = /(^|\/)(readme[^/]*|changelog|contributing|security|install|usage)\.mdx?$|(^|\/)docs?\/.*\.mdx?$/i;
const MODEL_CORPUS = /(^|\/)(\.claude|skills|architectural-rules|agents|commands|memory|plans|specs|visions|blueprints|claude-md|node_modules)\/|(^|\/)(claude|agents|gemini)\.md$/i;

function inScope(rel) {
  return USER_DOC.test(rel) && !MODEL_CORPUS.test(rel);
}

function catalogue() {
  const dir = path.join(__dirname, '..', 'skills', 'write', 'references');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^ai-vocabulary\.v\d+\.md$/.test(f));
  } catch {
    return [];
  }
  files.sort((a, b) => Number(/v(\d+)/.exec(b)[1]) - Number(/v(\d+)/.exec(a)[1]));
  if (!files.length) return [];
  const text = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  const sectionA = (/## A\.[\s\S]*?(?=\n## )/.exec(text) || [''])[0];
  const terms = new Set();
  for (const line of sectionA.split('\n')) {
    const m = /^\*\*[^*]+:\*\*\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    // "utilize → use" keeps the long word; "leverage (as verb)" keeps "leverage".
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

// Prose only: drop front matter, fences, tables, inline code, links, headings, HTML.
function prose(md) {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '\n')
    .replace(/^\s*\|.*$/gm, '')
    .replace(/^\s*#.*$/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/`[^`\n]*`/g, 'code')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link');
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n\s*\n|\n\s*[-*+]\s+|\n\s*\d+\.\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[a-z]/i.test(s));
}

function countWords(s) {
  return (s.match(/[A-Za-z][\w'’-]*/g) || []).length;
}

function check(md, terms) {
  const text = prose(md);
  const words = countWords(text);
  if (words < MIN_WORDS) return null;
  const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = {};
  for (const t of terms) {
    const re = new RegExp('(?<![\\w-])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:s|es|d|ed|ing)?(?![\\w-])', 'g');
    const n = (lower.match(re) || []).length;
    if (n) hits[t] = n;
  }
  const lexicon = Object.values(hits).reduce((a, b) => a + b, 0);
  const sents = sentences(text);
  const long = sents.filter((s) => countWords(s) > LONG_SENTENCE).length;
  const per1k = (lexicon * 1000) / words;
  const out = [];
  if (lexicon >= MIN_LEXICON_HITS && per1k >= LEXICON_PER_1K) {
    const top = Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t} ×${n}`);
    out.push(`${per1k.toFixed(0)} catalogue words per 1,000 (${top.join(', ')})`);
  }
  if (long >= MIN_LONG && long / sents.length >= LONG_SHARE) {
    out.push(`${long} of ${sents.length} sentences over ${LONG_SENTENCE} words`);
  }
  return out.length ? out : null;
}

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();
  const raw = (payload.tool_input || {}).file_path;
  if (!raw) return io.allow();
  const root = io.projectRoot();
  const target = io.resolvePath(raw);
  if (!io.isDescendant(target, root)) return io.allow();
  const rel = io.normalise(path.relative(path.resolve(root), target));
  if (!inScope(rel)) return io.allow();

  const md = fs.readFileSync(target, 'utf8');
  const found = check(md, catalogue());
  const p = io.hookStateFile('prose-lint', io.sessionId(payload));
  const seen = io.readJsonIfExists(p) || {};
  const key = found ? found.join('; ') : '';
  if (seen[rel] === key) return io.allow();
  seen[rel] = key;
  try {
    io.writeFileAtomic(p, JSON.stringify(seen) + '\n');
  } catch {
    // Not fatal: the same report may show twice.
  }
  if (!found) return io.allow();
  io.advise(
    `Prose check on ${rel} (advisory, density only): ${found.join('; ')}. ` +
      'This is a user-facing doc: prefer short common words and shorter sentences. /humanize can rewrite it.'
  );
}

main().catch(() => io.allow());
