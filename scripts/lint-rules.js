'use strict';

// Rules lint: every architectural-rule file must have frontmatter that (1) parses
// as strict YAML, (2) declares the required keys, and (3) uses only recognized
// relevance tokens. A malformed rule silently drops out of priming/resolution —
// this catches that class loudly. Run on demand or from bootstrap --verify:
//   node scripts/lint-rules.js
// Exit 0 = clean, exit 1 = problems found.
//
// No YAML dependency: rule frontmatter is a flat block (the same shape the
// resolver's line parser reads), so a strict line-parser here matches what
// actually consumes these files. A ": " inside an unquoted value is the specific
// break that has silently dropped a rule before — that is checked explicitly.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const RULES_DIR = path.join(REPO_ROOT, 'architectural-rules');

const REQUIRED_KEYS = ['name', 'scope', 'relevance'];

// Recognized relevance token prefixes/exact values (architectural-rules/README.md
// + docs/architectural-rules.md action-axis). A token is valid if it equals an
// exact value or starts with a known prefix.
const RELEVANCE_EXACT = new Set(['always', 'on-demand', 'when-invoking-tools', 'when-publishing', 'when-writing-tests']);
const RELEVANCE_PREFIXES = [
  'when-language-', 'when-engine-', 'when-platform-', 'when-domain-',
  'when-touching-', 'when-authoring-', 'when-designing-', 'during-',
];

function isValidRelevanceToken(tok) {
  const t = tok.trim();
  if (!t) return false;
  if (RELEVANCE_EXACT.has(t)) return true;
  return RELEVANCE_PREFIXES.some((p) => t.startsWith(p) && t.length > p.length);
}

function ruleFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...ruleFiles(abs)); continue; }
    if (e.name === 'README.md' || !e.name.endsWith('.md')) continue;
    out.push(abs);
  }
  return out;
}

// Extract the frontmatter block and parse it as flat key: value lines, the way
// resolve-rules.js does. Returns { fields, error }.
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { error: 'no frontmatter block' };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { error: 'unterminated frontmatter block' };
  const block = text.slice(3, end).replace(/^\r?\n/, '');
  const fields = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    // A key line is `key: value`. Continuation/list lines (indented, or "- ")
    // belong to the previous key — tolerate them without treating as new keys.
    if (/^\s/.test(raw) || raw.trimStart().startsWith('- ')) continue;
    const m = raw.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (!m) return { error: `unparseable frontmatter line ${i + 1}: "${raw.slice(0, 50)}"` };
    const key = m[1];
    let val = m[2];
    // Strict-YAML break: an unquoted value containing ": " is a mapping-value
    // error in a strict parser and silently drops the file from strict consumers.
    const quoted = /^".*"$/.test(val) || /^'.*'$/.test(val);
    if (!quoted && / : |: /.test(val) && key === 'description') {
      return { error: `unquoted ": " in description value (breaks strict YAML) — quote it` };
    }
    fields[key] = val;
  }
  return { fields };
}

function main() {
  const files = ruleFiles(RULES_DIR);
  const problems = [];

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    const { fields, error } = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
    if (error) { problems.push(`${rel}: ${error}`); continue; }

    for (const k of REQUIRED_KEYS) {
      if (!(k in fields) || !String(fields[k]).trim()) problems.push(`${rel}: missing required key "${k}"`);
    }

    if (fields.relevance) {
      const tokens = String(fields.relevance).replace(/^\[|\]$/g, '').split(',');
      for (const tok of tokens) {
        if (!isValidRelevanceToken(tok)) {
          problems.push(`${rel}: unrecognized relevance token "${tok.trim()}" (not in the documented vocabulary)`);
        }
      }
    }
  }

  if (problems.length) {
    process.stderr.write(`rules-lint: ${problems.length} problem(s) across ${files.length} rule file(s)\n`);
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.exit(1);
  }
  process.stdout.write(`rules-lint: OK — ${files.length} rule file(s), frontmatter valid, relevance vocabulary clean\n`);
}

main();
