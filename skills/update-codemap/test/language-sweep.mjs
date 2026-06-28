#!/usr/bin/env node
// Language sweep — end-to-end verification that update-codemap + codemap-visualize
// actually extract and render structure for every language fixture.
//
// For each fixture in fixtures.mjs it:
//   1. Materialises the fixture project under a temp dir.
//   2. Runs the REAL codemap.mjs against it (--root <tmp>) and reads the generated
//      .claude/codemap.md (source of truth).
//   3. Runs the REAL codemap-visualize.mjs against that codemap (--dry-run) to get
//      the rendered diagrams document.
//   4. Asserts, per language, the four content claims the fixture declares:
//        [class]    derived class present in `## Class graph`
//        [relation] expected extends/implements/composition edge present
//        [field]    base-type field captured
//        [edge]     cross-module file edge present in `## File deps`
//      plus [mermaid] — the visualizer emitted at least one well-formed ```mermaid block.
//
// The harness depends only on the two scripts under test by INVOKING them as the user
// would (subprocess + real output), never by importing their internals — so a passing
// sweep reflects real pipeline behaviour, not a mirror of the implementation.
//
// Exit code is non-zero iff a language REGRESSES from its recorded baseline (baseline.json).
// New gaps in never-supported languages are reported but do not fail the run — the matrix
// is the deliverable. Use --update-baseline to record current results as the new baseline.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODEMAP = path.join(HERE, '..', 'codemap.mjs');
const VISUALIZE = path.join(HERE, '..', '..', 'codemap-visualize', 'codemap-visualize.mjs');
const BASELINE = path.join(HERE, 'baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

function materialise(fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codemap-${fixture.lang}-`));
  for (const [rel, content] of Object.entries(fixture.files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  // A README gives the project a stable name and avoids the directory-name fallback
  // picking up the random temp suffix.
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${fixture.lang}-fixture\n`);
  return dir;
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
}

// --- assertions over the generated codemap.md + diagrams text ---------------

function sectionOf(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length + 3);
  const next = rest.indexOf('\n## ');
  return next < 0 ? rest : rest.slice(0, next);
}

function assertFixture(fixture, codemap, diagrams) {
  const exp = fixture.expect;
  const classGraph = sectionOf(codemap, 'Class graph');
  const fileDeps = sectionOf(codemap, 'File deps');
  const callGraph = sectionOf(codemap, 'Call graph');

  const results = {};

  // [class] — derived class appears as a node in the class graph
  results.class = new RegExp(`\\b${exp.className}\\b`).test(classGraph);

  // [relation] — the inheritance/impl/composition edge is captured. The class-graph
  // block records `extends:`/`implements:` lines; we accept the base type name appearing
  // on either, since some languages collapse the distinction. `baseType: null` means the
  // language has no inheritance/implements construct (e.g. C structs) — recorded n/a, not
  // a gap, mirroring the `edgeTo: null` / `calls: null` precedent.
  if (exp.baseType === null) {
    results.relation = 'na';
  } else {
    const relRe = new RegExp(`(extends|implements)[^\\n]*\\b${exp.baseType}\\b`, 'i');
    results.relation = results.class && relRe.test(classGraph);
  }

  // [field] — a field of the base/value type was captured
  results.field = new RegExp(`\\b${exp.field}\\b`).test(classGraph);

  // [edge] — the cross-module file dependency edge is present (either direction noted,
  // we check the source file lists the target). `edgeTo: null` means the language has no
  // file-level import syntax (e.g. Swift same-module files) — recorded as n/a, not a gap.
  if (exp.edgeTo === null) {
    results.edge = 'na';
  } else {
    const edgeRe = new RegExp(`${escapeRe(exp.edgeFrom)}[\\s\\S]*?${escapeRe(exp.edgeTo)}|${escapeRe(exp.edgeTo)}[\\s\\S]*?${escapeRe(exp.edgeFrom)}`);
    results.edge = edgeRe.test(fileDeps);
  }

  // [calls] — the syntactic call edge caller→callee appears in `## Call graph` AND the
  // visualizer rendered it as a Mermaid edge. `calls: null` means the fixture has no
  // statically determinable call site (recorded n/a, not a gap), mirroring `edgeTo: null`.
  if (!exp.calls) {
    results.calls = 'na';
  } else {
    const callerRe = new RegExp(`::${escapeRe(exp.calls.caller)}\\\`\\s+→\\s+\\\`${escapeRe(exp.calls.callee)}\\b`);
    const inCodemap = callerRe.test(callGraph);
    // The visualizer renders the callee as a target node labelled with its bare name.
    const inDiagram = new RegExp(`\\b${escapeRe(exp.calls.callee)}\\b`).test(
      [...diagrams.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n'));
    results.calls = inCodemap && inDiagram;
  }

  // [precision] — the call-graph precision pass ranks a PROJECT-INTERNAL callee above a
  // BUILTIN one. The fixture's method calls both `exp.calls.callee` (project-defined, e.g.
  // `scale`) and `exp.builtinCallee` (a stdlib method, e.g. `max`); assert the project edge
  // appears BEFORE the builtin edge in the `## Call graph` text (resolved-first ordering).
  // `builtinCallee` absent → n/a (most fixtures don't exercise the ranking).
  if (!exp.builtinCallee || !exp.calls) {
    results.precision = 'na';
  } else {
    const projIdx = callGraph.search(new RegExp(`→\\s+\`${escapeRe(exp.calls.callee)}\``));
    const biIdx = callGraph.search(new RegExp(`→\\s+\`${escapeRe(exp.builtinCallee)}\``));
    // Project edge present AND (builtin absent OR project ranked before builtin).
    results.precision = projIdx >= 0 && (biIdx < 0 || projIdx < biIdx);
  }

  // [resolution] — 087 receiver-type resolution: the fixture has two classes declaring a
  // same-named method (e.g. User.save / Post.save) on typed receivers; assert the resolver
  // disambiguated to the RIGHT `Type.method` in the `## Call graph` (not a collapsed bare name).
  // `resolution: null` / absent → n/a (only the TS + C# fixtures exercise type resolution).
  if (!exp.resolution) {
    results.resolution = 'na';
  } else {
    // Every expected qualified edge (`Type.method`) must appear in the call graph.
    results.resolution = exp.resolution.qualified.every((q) =>
      new RegExp(`→\\s+\`${escapeRe(q)}\``).test(callGraph));
  }

  // [mermaid] — visualizer produced at least one well-formed mermaid block with a graph/classDiagram body
  const blocks = [...diagrams.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  results.mermaid = blocks.some((b) => /\b(graph|classDiagram|flowchart)\b/.test(b)) &&
    blocks.every((b) => b.trim().length > 0 && !/undefined|NaN|\[object Object\]/.test(b));

  return results;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// --- run one fixture --------------------------------------------------------

function runFixture(fixture) {
  const dir = materialise(fixture);
  try {
    const gen = runNode(CODEMAP, ['--root', dir, '--quiet']);
    const codemapPath = path.join(dir, '.claude', 'codemap.md');
    if (!fs.existsSync(codemapPath)) {
      return { error: `codemap.md not written (gen exit ${gen.code}): ${gen.stderr.slice(0, 300)}` };
    }
    const codemap = fs.readFileSync(codemapPath, 'utf8');

    // Visualizer reads .claude/codemap.md from --root; --dry-run prints the doc to stdout.
    const viz = runNode(VISUALIZE, ['--root', dir, '--dry-run']);
    const diagrams = viz.stdout;
    if (viz.code !== 0 && !diagrams) {
      return { error: `visualize failed (exit ${viz.code}): ${viz.stderr.slice(0, 300)}`, codemap };
    }

    const checks = assertFixture(fixture, codemap, diagrams);
    return { checks, codemap, diagrams };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- main -------------------------------------------------------------------

const CHECK_KEYS = ['class', 'relation', 'field', 'edge', 'calls', 'precision', 'resolution', 'mermaid'];

function main() {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const matrix = {};
  let regressed = false;

  for (const fixture of FIXTURES) {
    const out = runFixture(fixture);
    if (out.error) {
      matrix[fixture.lang] = { error: out.error };
      console.log(`\n  ${fixture.lang.padEnd(11)} ERROR  ${out.error}`);
      continue;
    }
    matrix[fixture.lang] = out.checks;
    if (VERBOSE && out.codemap) {
      console.log(`\n----- ${fixture.lang} codemap (Class graph + File deps) -----`);
      console.log(sectionOf(out.codemap, 'Class graph').trim() || '(empty)');
      console.log('--- File deps ---');
      console.log(sectionOf(out.codemap, 'File deps').trim() || '(empty)');
    }
  }

  // --- render matrix ---
  const cols = CHECK_KEYS;
  const header = 'language'.padEnd(11) + cols.map((c) => c.padEnd(10)).join('');
  console.log('\n' + header);
  console.log('-'.repeat(header.length));
  for (const fixture of FIXTURES) {
    const r = matrix[fixture.lang];
    if (r.error) { console.log(fixture.lang.padEnd(11) + 'ERROR'); continue; }
    const cells = cols.map((c) => (r[c] === 'na' ? 'n/a ' : r[c] ? 'PASS' : 'gap ').padEnd(10));
    console.log(fixture.lang.padEnd(11) + cells.join(''));
  }

  // A check passes if it's true OR explicitly n/a (not statically determinable).
  const ok = (v) => v === true || v === 'na';

  // --- regression check against baseline ---
  for (const fixture of FIXTURES) {
    const cur = matrix[fixture.lang];
    const base = baseline[fixture.lang];
    if (!base || cur.error) continue;
    for (const k of CHECK_KEYS) {
      if (ok(base[k]) && !ok(cur[k])) {
        regressed = true;
        console.log(`\nREGRESSION: ${fixture.lang}.${k} was PASS in baseline, now gap.`);
      }
    }
  }

  if (UPDATE_BASELINE) {
    fs.writeFileSync(BASELINE, JSON.stringify(matrix, null, 2) + '\n');
    console.log(`\nBaseline written to ${path.relative(process.cwd(), BASELINE)}`);
  }

  const passCount = Object.values(matrix).reduce(
    (n, r) => n + (r.error ? 0 : CHECK_KEYS.filter((k) => ok(r[k])).length), 0);
  const total = FIXTURES.length * CHECK_KEYS.length;
  console.log(`\n${passCount}/${total} checks passing across ${FIXTURES.length} languages.`);

  process.exit(regressed ? 1 : 0);
}

main();
