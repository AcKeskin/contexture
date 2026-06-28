'use strict';

// Tests for the path-aware instruction-glob expander.
// Plain-node test, matching the repo convention (skills/new-hook/lib/*.test.js):
// a check() helper + PASS/FAIL counters, run with `node hooks/lib/glob-files.test.js`.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expandInstructionGlobs, expandOne, literalPrefix } = require('./glob-files');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`PASS: ${name}`);
    pass++;
  } else {
    console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

// --- Build a fixture tree ---------------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-instructions-'));
function write(rel, content = 'x') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
write('docs/standards.md');
write('docs/deep/nested/notes.md');
write('packages/web/AGENTS.md');
write('packages/api/AGENTS.md');
write('packages/shared/README.md'); // not an AGENTS.md — must NOT match the AGENTS glob
write('.cursor/rules/a.md');
write('.cursor/rules/b.md');
write('node_modules/pkg/AGENTS.md'); // must be skipped (skip-dir)

function rels(matches) {
  return matches.map((m) => m.relpath).sort();
}

// --- literalPrefix ----------------------------------------------------------
check('literalPrefix: literal file → its dir', literalPrefix('docs/standards.md') === 'docs', literalPrefix('docs/standards.md'));
check('literalPrefix: glob at segment → prefix before it', literalPrefix('packages/*/AGENTS.md') === 'packages', literalPrefix('packages/*/AGENTS.md'));
check('literalPrefix: basename glob → its dir', literalPrefix('.cursor/rules/*.md') === '.cursor/rules', literalPrefix('.cursor/rules/*.md'));
check('literalPrefix: leading glob → empty', literalPrefix('*.md') === '', literalPrefix('*.md'));

// --- expandOne: literal path ------------------------------------------------
check('literal path matches the file', JSON.stringify(expandOne('docs/standards.md', root)) === JSON.stringify(['docs/standards.md']));
check('literal path missing → []', expandOne('docs/missing.md', root).length === 0);

// --- expandOne: basename glob ----------------------------------------------
check('basename glob matches both rule files',
  JSON.stringify(expandOne('.cursor/rules/*.md', root)) === JSON.stringify(['.cursor/rules/a.md', '.cursor/rules/b.md']));

// --- expandOne: path-segment glob (the headline case) -----------------------
{
  const m = expandOne('packages/*/AGENTS.md', root);
  check('path-segment glob matches both packages', JSON.stringify(m) === JSON.stringify(['packages/api/AGENTS.md', 'packages/web/AGENTS.md']), JSON.stringify(m));
  check('path-segment glob does NOT match shared/README.md', !m.includes('packages/shared/README.md'));
}

// --- expandOne: ** recursive segment ----------------------------------------
{
  const m = expandOne('docs/**/*.md', root);
  check('** recurses into nested dirs', m.includes('docs/deep/nested/notes.md'), JSON.stringify(m));
  check('** also matches the shallow file (zero dirs)', m.includes('docs/standards.md'), JSON.stringify(m));
}

// --- skip-dirs --------------------------------------------------------------
{
  const m = expandOne('**/AGENTS.md', root);
  check('node_modules is skipped', !m.some((r) => r.startsWith('node_modules/')), JSON.stringify(m));
  check('** finds package AGENTS files', m.includes('packages/web/AGENTS.md') && m.includes('packages/api/AGENTS.md'), JSON.stringify(m));
}

// --- expandInstructionGlobs: array, dedup, subtree tagging ------------------
{
  const matches = expandInstructionGlobs(
    ['docs/standards.md', 'packages/*/AGENTS.md', '.cursor/rules/*.md', 'docs/standards.md'], // last is a dup
    root
  );
  check('array expansion: all unique matches present',
    JSON.stringify(rels(matches)) ===
      JSON.stringify(['.cursor/rules/a.md', '.cursor/rules/b.md', 'docs/standards.md', 'packages/api/AGENTS.md', 'packages/web/AGENTS.md']),
    JSON.stringify(rels(matches)));
  check('array expansion: dedups the repeated literal', rels(matches).filter((r) => r === 'docs/standards.md').length === 1);

  const web = matches.find((m) => m.relpath === 'packages/web/AGENTS.md');
  check('subtree tagged from the glob literal prefix', web && web.subtree === 'packages', web && web.subtree);
  const std = matches.find((m) => m.relpath === 'docs/standards.md');
  check('literal file subtree is its dir', std && std.subtree === 'docs', std && std.subtree);
  const absExists = matches.every((m) => fs.existsSync(m.file));
  check('every match carries a real absolute path', absExists);
}

// --- empty / absent input ---------------------------------------------------
check('empty array → []', expandInstructionGlobs([], root).length === 0);
check('undefined → []', expandInstructionGlobs(undefined, root).length === 0);
check('no-match glob → []', expandOne('packages/*/NOPE.md', root).length === 0);

// --- cleanup ----------------------------------------------------------------
try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
