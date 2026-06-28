#!/usr/bin/env node
'use strict';

// Deterministic mechanical-convention detector for /extract-conventions
// (Step 2). Frequency-analyzes a sampled file set for the
// MECHANICAL conventions a machine can count without judgment: identifier case
// style per kind, member prefixes, import/using ordering, indentation, brace
// style. Returns each detected convention with its dominant value, share,
// confidence, and the files it was observed in.
//
// Determinism is the contract: the same files yield the same report every run.
// That is the half done-criterion #2 calls "detected deterministically" — and
// why it is a script, not a model judgment. Semantic conventions (comment
// style, idioms) are the SKILL's model-judged half; they are NOT here.
//
// Zero dependencies — plain fs + regex/line heuristics, no tree-sitter. The
// codemap's AST machinery is deliberately not coupled (it is independently
// in-flight); a future version may consume its output for structural conventions.
//
// CLI:  node detect.mjs <file...>            → JSON report to stdout
//       node detect.mjs --dir <dir>          → sample the dir, then report
// Lib:  import { detectConventions } from './detect.mjs'
//
// Confidence thresholds (share of the dominant value over observations):
//   >= 0.80  → high     (a real convention)
//   >= 0.60  → medium   (a plurality worth surfacing, flagged)
//   <  0.60  → dropped  (no dominant convention for that axis — never invented)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIGH = 0.8;
const MEDIUM = 0.6;

// Languages we can mechanically analyze, keyed by extension.
const LANG_BY_EXT = {
  '.cs': 'csharp',
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.h': 'cpp',
  '.go': 'go',
  '.java': 'java',
};

// --- case classification ----------------------------------------------------

function classifyCase(name) {
  if (!name || !/^[A-Za-z_]/.test(name)) return null;
  if (/^[A-Z][A-Z0-9_]*$/.test(name) && name.includes('_')) return 'SCREAMING_SNAKE';
  if (/^[A-Z0-9_]+$/.test(name) && name.length > 1 && name === name.toUpperCase()) return 'SCREAMING_SNAKE';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  return 'other';
}

// Strip a leading member-prefix and report it. Returns { prefix, rest }.
function splitPrefix(name) {
  let m = name.match(/^(m_|s_|g_|k_|_)([A-Za-z].*)$/);
  if (m) return { prefix: m[1], rest: m[2] };
  return { prefix: 'none', rest: name };
}

// --- per-file extraction ----------------------------------------------------
// Heuristic identifier extraction by kind. Not a parser — regexes tuned to the
// common declaration shapes. Over-counting a few false identifiers is fine;
// frequency analysis is robust to noise, and determinism is preserved.

function extractIdentifiers(text, lang) {
  const types = [];     // class / struct / interface / enum / type names
  const fields = [];    // instance/static data members (carry m_/_ prefixes)
  const members = [];   // methods / properties (for case analysis, NOT prefix)
  const locals = [];    // local variable declarations
  const constants = [];

  const typeRe = /\b(?:class|struct|interface|enum|trait|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = typeRe.exec(text))) types.push(m[1]);

  // Fields: an access modifier (or readonly) followed by a type and a name that
  // terminates in `;` or `=` (NOT `(` — that's a method). These are the members
  // a prefix convention like `m_` actually governs.
  const fieldRe = /\b(?:public|private|protected|internal|static|readonly|\s)+[A-Za-z_][\w<>\[\],.\s]*?\s+([A-Za-z_]\w*)\s*[;=]/g;
  while ((m = fieldRe.exec(text))) {
    // Exclude obvious non-fields: property bodies handled below, locals via `var`.
    if (!/^\s*(?:var|let|const|val|return|if|for|while|switch)$/.test(m[1])) fields.push(m[1]);
  }

  // Methods / properties: a name immediately followed by `(` (method) or `{ get`
  // (auto-property). Used for case analysis only, never prefix.
  const methodRe = /\b(?:public|private|protected|internal|static|virtual|override|async)\s+(?:[A-Za-z_<>\[\],\s]+\s+)?([A-Za-z_]\w*)\s*\(/g;
  while ((m = methodRe.exec(text))) members.push(m[1]);
  const propRe = /\b(?:public|private|protected|internal)\s+(?:[A-Za-z_<>\[\],\s]+\s+)?([A-Za-z_]\w*)\s*\{\s*get/g;
  while ((m = propRe.exec(text))) members.push(m[1]);
  // Python def / Rust fn are members too.
  for (const re of [/\bdef\s+([a-zA-Z_]\w*)/g, /\bfn\s+([a-zA-Z_]\w*)/g]) while ((m = re.exec(text))) members.push(m[1]);

  // Locals: `let/var/const/val x`.
  const localRe = /\b(?:let|var|const|val)\s+([a-z_]\w*)\s*[=:;]/g;
  while ((m = localRe.exec(text))) locals.push(m[1]);

  // Constants: SCREAMING_SNAKE const/final/define declarations.
  const constRe = /\b(?:const|final|static\s+readonly|#define)\s+(?:[A-Za-z_<>\[\]]+\s+)?([A-Z_][A-Z0-9_]*)\b/g;
  while ((m = constRe.exec(text))) constants.push(m[1]);

  return { types, fields, members, locals, constants };
}

function detectIndentation(text) {
  const lines = text.split(/\r?\n/);
  let tabs = 0, spaces = 0;
  const spaceWidths = {};
  for (const line of lines) {
    const lead = line.match(/^([ \t]+)\S/);
    if (!lead) continue;
    if (lead[1][0] === '\t') tabs++;
    else { spaces++; const w = lead[1].length; if (w <= 8) spaceWidths[w] = (spaceWidths[w] || 0) + 1; }
  }
  const total = tabs + spaces;
  if (total === 0) return null;
  const useTabs = tabs > spaces;
  let width = null;
  if (!useTabs) {
    // Most common small indent step is the width (2 or 4 typically).
    const gcdGuess = Object.entries(spaceWidths).sort((a, b) => b[1] - a[1])[0];
    width = gcdGuess ? Number(gcdGuess[0]) : null;
  }
  return { style: useTabs ? 'tabs' : 'spaces', width };
}

function detectBraceStyle(text, lang) {
  if (lang === 'python') return null; // no braces
  const lines = text.split(/\r?\n/);
  let sameLine = 0, nextLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // declaration line ending with `{` → same-line (K&R)
    if (/\)\s*\{\s*$/.test(l) || /\b(?:else|try|do)\s*\{\s*$/.test(l)) sameLine++;
    // declaration line with no brace, next non-empty line is a lone `{` → next-line (Allman)
    else if (/\)\s*$/.test(l) && lines[i + 1] && /^\s*\{\s*$/.test(lines[i + 1])) nextLine++;
  }
  const total = sameLine + nextLine;
  if (total < 3) return null;
  const dominant = sameLine >= nextLine ? 'same-line (K&R)' : 'next-line (Allman)';
  return { dominant };
}

function detectImportOrdering(text, lang) {
  const lines = text.split(/\r?\n/);
  let importLines;
  if (lang === 'csharp') importLines = lines.filter((l) => /^\s*using\s+[A-Za-z]/.test(l)).map((l) => l.trim());
  else if (lang === 'python') importLines = lines.filter((l) => /^\s*(?:import|from)\s+/.test(l)).map((l) => l.trim());
  else importLines = lines.filter((l) => /^\s*import\s+/.test(l)).map((l) => l.trim());
  if (importLines.length < 3) return null;
  const sorted = [...importLines].sort();
  const isAlpha = importLines.every((v, i) => v === sorted[i]);
  return { ordering: isAlpha ? 'alphabetical' : 'unordered/grouped' };
}

// --- aggregation ------------------------------------------------------------

function dominantOf(countsByFile) {
  // countsByFile: Map<file, {value: count}> — aggregates to the dominant value,
  // its share of all observations, and the set of files it was observed in.
  const valueTotals = {};
  let total = 0;
  const evidence = {};
  for (const [file, valueCounts] of countsByFile) {
    for (const [value, n] of Object.entries(valueCounts)) {
      valueTotals[value] = (valueTotals[value] || 0) + n;
      total += n;
      (evidence[value] = evidence[value] || new Set()).add(file);
    }
  }
  if (total === 0) return null;
  const [domValue, domCount] = Object.entries(valueTotals).sort((a, b) => b[1] - a[1])[0];
  const share = domCount / total;
  let confidence;
  if (share >= HIGH) confidence = 'high';
  else if (share >= MEDIUM) confidence = 'medium';
  else return { dominant: domValue, share, confidence: 'none', observations: total, evidence: [...(evidence[domValue] || [])] };
  return { dominant: domValue, share, confidence, observations: total, evidence: [...(evidence[domValue] || [])] };
}

export function detectConventions(files) {
  // Per-axis accumulators: Map<file, {value: count}>
  const axes = {
    'case:types': new Map(),
    'case:members': new Map(),
    'case:fields': new Map(),
    'case:locals': new Map(),
    'case:constants': new Map(),
    'prefix:fields': new Map(),
    indentation: new Map(),
    brace: new Map(),
    imports: new Map(),
  };

  const langs = {};
  let read = 0;

  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lang = LANG_BY_EXT[path.extname(file).toLowerCase()];
    if (!lang) continue;
    langs[lang] = (langs[lang] || 0) + 1;
    read++;

    const ids = extractIdentifiers(text, lang);
    const tally = (axis, names, mapper) => {
      const vc = {};
      for (const n of names) {
        const v = mapper(n);
        if (v) vc[v] = (vc[v] || 0) + 1;
      }
      if (Object.keys(vc).length) axes[axis].set(file, vc);
    };
    tally('case:types', ids.types, classifyCase);
    tally('case:members', ids.members, (n) => classifyCase(splitPrefix(n).rest));
    tally('case:fields', ids.fields, (n) => classifyCase(splitPrefix(n).rest));
    tally('case:locals', ids.locals, classifyCase);
    tally('case:constants', ids.constants, classifyCase);
    // Prefix convention is measured over FIELDS only — methods/properties/locals
    // don't idiomatically carry m_/_; including them dilutes the real signal.
    tally('prefix:fields', ids.fields, (n) => splitPrefix(n).prefix);

    const ind = detectIndentation(text);
    if (ind) axes.indentation.set(file, { [ind.width ? `${ind.style}-${ind.width}` : ind.style]: 1 });
    const brace = detectBraceStyle(text, lang);
    if (brace) axes.brace.set(file, { [brace.dominant]: 1 });
    const imp = detectImportOrdering(text, lang);
    if (imp) axes.imports.set(file, { [imp.ordering]: 1 });
  }

  // Resolve each axis to a dominant convention; drop the ones below MEDIUM.
  const conventions = [];
  const axisMeta = {
    'case:types': { category: 'naming', label: 'Type names' },
    'case:members': { category: 'naming', label: 'Method / property names' },
    'case:fields': { category: 'naming', label: 'Field names (case, prefix-stripped)' },
    'case:locals': { category: 'naming', label: 'Local names' },
    'case:constants': { category: 'naming', label: 'Constant names' },
    'prefix:fields': { category: 'naming', label: 'Field prefix' },
    indentation: { category: 'organization', label: 'Indentation' },
    brace: { category: 'organization', label: 'Brace style' },
    imports: { category: 'organization', label: 'Import ordering' },
  };

  for (const [axis, meta] of Object.entries(axisMeta)) {
    const res = dominantOf(axes[axis]);
    if (!res || res.confidence === 'none') {
      conventions.push({ axis, category: meta.category, label: meta.label, dominant: null, confidence: 'none', note: 'no dominant convention' });
      continue;
    }
    conventions.push({
      axis,
      category: meta.category,
      label: meta.label,
      dominant: res.dominant,
      share: Number(res.share.toFixed(2)),
      confidence: res.confidence,
      observations: res.observations,
      evidence: res.evidence.map((f) => path.basename(f)).slice(0, 6),
    });
  }

  return { filesAnalyzed: read, languages: langs, conventions };
}

// --- sampling (for --dir) ---------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', 'bin', 'obj', '.venv', 'venv', '__pycache__', '.next', 'vendor', 'coverage', '.claude']);

export function sampleDir(dir, { cap = 30 } = {}) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < cap * 4) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.claude') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(p); }
      else if (LANG_BY_EXT[path.extname(e.name).toLowerCase()]) out.push(p);
    }
  }
  // Representative sample: largest files first (more signal), capped.
  return out
    .map((f) => { let s = 0; try { s = fs.statSync(f).size; } catch {} return { f, s }; })
    .sort((a, b) => b.s - a.s)
    .slice(0, cap)
    .map((x) => x.f);
}

// --- CLI --------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  let files;
  if (args[0] === '--dir') {
    files = sampleDir(args[1] || '.');
  } else {
    files = args;
  }
  if (!files.length) {
    process.stderr.write('usage: detect.mjs <file...> | detect.mjs --dir <dir>\n');
    process.exit(1);
  }
  const report = detectConventions(files);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

// Run as CLI only when invoked directly (not when imported). Compare resolved
// paths — a naive endsWith('detect.mjs') also matches '__verify_detect.mjs'.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfPath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === selfPath) {
  main(process.argv);
}
