#!/usr/bin/env node
// Context-cost instrument for progressive-disclosure claims.
//
// Measures, for one real task, how many tokens three loading strategies put
// into context — so a "this moves cost off the always-on tier" claim can cite
// a number instead of a judgment call. The convention this serves: a
// disclosure claim cites a measurement or is marked untested
// (architectural-rules/config-authoring/disclosure-claims.md).
//
// Arms (hook-resolved, not a groping-agent model — this corpus's gated tiers
// are pulled by a resolver, so the interesting comparison is):
//   resident  — the whole measured surface resident (the flat-corpus
//               counterfactual). Recurs every turn; shown ×turns when given.
//   pulled    — the floor plus what the resolver/trigger actually pulls for
//               the task (disclosure working as designed — best case).
//   followon  — pulled + the additional files the model read anyway during
//               the task (from the transcript or hand-listed). The gap
//               between followon and pulled IS the disclosure tax; a large
//               gap on a routine task means the split put needed content
//               behind an extra read.
//
// Output is COMPARATIVE (arm deltas). Absolute totals are not a bill: the
// real request prefix (system prompt, tool schemas, cache behaviour) is
// outside what a script can count, and is identical across arms anyway.
//
// Counting method is printed in the report. If a BPE tokenizer package is
// installed (gpt-tokenizer or @dqbd/tiktoken) it is used; otherwise the
// chars/4 heuristic (the same estimate the rule-prime budget uses), with a
// words/0.75 cross-check shown so the reader sees the estimate's spread.
//
// Usage:
//   node scripts/context-cost.js --spec <task-spec.json> [--turns N]
//   node scripts/context-cost.js --spec scripts/context-cost.example.json
//
// Spec shape:
//   {
//     "task": "one-line description of the real task measured",
//     "turns": 12,                          // optional; ×turns shown for resident
//     "arms": {
//       "resident": ["architectural-rules"],          // dirs, files, or dir/**/*.ext
//       "pulled":   ["architectural-rules/universal/git.md", "..."],
//       "followon": ["..."]                 // ADDITIONAL to pulled (union is used)
//     }
//   }
//
// .md files under architectural-rules/ are counted frontmatter- and
// anchor-stripped — the bytes that actually reach context when primed.
// Everything else is counted raw. That transform is part of the method line.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- Tokenizer resolution (method is reported, never silent) -----------------

function resolveTokenizer() {
  try {
    const { encode } = require('gpt-tokenizer');
    return { name: 'BPE (gpt-tokenizer, o200k_base)', count: (t) => encode(t).length, bpe: true };
  } catch {}
  try {
    const { get_encoding } = require('@dqbd/tiktoken');
    const enc = get_encoding('o200k_base');
    return { name: 'BPE (@dqbd/tiktoken, o200k_base)', count: (t) => enc.encode(t).length, bpe: true };
  } catch {}
  return {
    name: 'chars/4 heuristic (no BPE tokenizer installed; words/0.75 cross-check shown)',
    count: (t) => Math.ceil(t.length / 4),
    bpe: false,
  };
}

function wordsCount(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

// --- File collection ---------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.worktrees']);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
}

// Accepts: a file path, a directory path (recursive), or dir/**/*.ext.
function expandEntry(entry) {
  const globMatch = entry.match(/^(.*?)[\\/]\*\*[\\/]\*(\.[A-Za-z0-9]+)$/);
  if (globMatch) {
    const base = path.resolve(ROOT, globMatch[1]);
    const ext = globMatch[2];
    const all = [];
    walk(base, all);
    return all.filter((f) => f.endsWith(ext));
  }
  const abs = path.resolve(ROOT, entry);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    process.stderr.write(`warn: spec entry not found, skipped: ${entry}\n`);
    return [];
  }
  if (st.isDirectory()) {
    const all = [];
    walk(abs, all);
    return all;
  }
  return [abs];
}

function collect(entries) {
  const set = new Set();
  for (const e of entries || []) for (const f of expandEntry(e)) set.add(f);
  return [...set].sort();
}

// --- Content transform (count what reaches context) --------------------------

function contextBytes(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('architectural-rules/') && file.endsWith('.md')) {
    // Primed rules reach context frontmatter- and anchor-stripped.
    if (text.startsWith('---')) {
      const end = text.indexOf('\n---', 3);
      if (end !== -1) {
        const after = text.indexOf('\n', end + 1);
        text = after === -1 ? '' : text.slice(after + 1);
      }
    }
    text = text.replace(/<!-- id: [^>]*-->\s?/g, '');
  }
  return text;
}

// --- Measurement -------------------------------------------------------------

function measureArm(files, tok) {
  let tokens = 0;
  let words = 0;
  for (const f of files) {
    const text = contextBytes(f);
    tokens += tok.count(text);
    words += wordsCount(text);
  }
  return { files: files.length, tokens, wordsEstimate: words };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function main() {
  const args = process.argv.slice(2);
  const specIdx = args.indexOf('--spec');
  if (specIdx === -1 || !args[specIdx + 1]) {
    process.stderr.write('usage: node scripts/context-cost.js --spec <task-spec.json> [--turns N]\n');
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(path.resolve(args[specIdx + 1]), 'utf8'));
  const turnsIdx = args.indexOf('--turns');
  const turns = turnsIdx !== -1 ? Number(args[turnsIdx + 1]) : spec.turns || null;

  const tok = resolveTokenizer();
  const arms = spec.arms || {};

  const residentFiles = collect(arms.resident);
  const pulledFiles = collect(arms.pulled);
  const followonFiles = collect([...(arms.pulled || []), ...(arms.followon || [])]);

  const resident = measureArm(residentFiles, tok);
  const pulled = measureArm(pulledFiles, tok);
  const followon = measureArm(followonFiles, tok);

  const lines = [];
  lines.push(`context-cost report`);
  lines.push(`task:    ${spec.task || '(unspecified — name the real task measured)'}`);
  lines.push(`method:  ${tok.name}`);
  lines.push(`         architectural-rules/*.md counted frontmatter- and anchor-stripped; other files raw`);
  lines.push('');
  lines.push(`arm        files   tokens${tok.bpe ? '' : '   (words/0.75)'}`);
  for (const [name, m] of [['resident', resident], ['pulled', pulled], ['followon', followon]]) {
    lines.push(
      `${name.padEnd(10)} ${String(m.files).padStart(5)}   ${fmt(m.tokens).padStart(8)}${tok.bpe ? '' : `   (${fmt(m.wordsEstimate)})`}`
    );
  }
  lines.push('');
  lines.push(`deltas (the measurement — totals above are not a bill):`);
  lines.push(`  disclosure saving, best case (resident − pulled):   ${fmt(resident.tokens - pulled.tokens)} tok/load`);
  lines.push(`  disclosure tax, this task (followon − pulled):      ${fmt(followon.tokens - pulled.tokens)} tok`);
  if (turns) {
    lines.push(`  resident arm recurs per turn: ×${turns} turns ≈ ${fmt(resident.tokens * turns)} tok vs one-time pulls`);
  } else {
    lines.push(`  (resident recurs every turn; pass --turns N to see the amortized gap)`);
  }
  lines.push('');
  lines.push(`note: the followon arm is derived from what was actually read for THIS task —`);
  lines.push(`it is a measurement of one task, not a model of agents in general.`);
  process.stdout.write(lines.join('\n') + '\n');
}

main();
