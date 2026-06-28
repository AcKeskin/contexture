'use strict';

// Path-aware instruction-glob expander.
//
// Expands the `rulePrime.instructions` declaration — an array of paths and globs
// naming ADDITIONAL instruction files for 077's prime hook to load, beyond the
// fixed CLAUDE.md tree — into a concrete file list, tagged with the deepest
// non-glob directory prefix (the "subtree") so the hook can scope-gate a
// multi-match glob (packages/*/AGENTS.md) instead of loading every match at once.
//
// Supported pattern syntax (deliberately small — instruction sourcing, not a
// general glob engine):
//   - literal path:            docs/coding-standards.md
//   - basename wildcard:       .cursor/rules/*.md       (* and ? within a segment)
//   - path-segment wildcard:   packages/*/AGENTS.md     (* as a whole path segment)
//   - recursive segment:       docs/**/*.md             (** matches zero+ dirs)
//
// `*` and `?` match WITHIN a single path segment (never across `/`). `**` is the
// only cross-directory wildcard, and only as a whole segment. This mirrors the
// common .gitignore/editor-glob intuition and keeps expansion bounded + cheap on
// the UserPromptSubmit hot path.
//
// Pure module: readdir/stat only, no writes. Bounded by a file cap + skip-dirs so
// a pathological tree can't stall the hook. Fail-soft: an unreadable dir is
// skipped, never thrown.

const fs = require('fs');
const path = require('path');

// Vendored / generated / VCS dirs never worth walking — mirrors rule-prime.js's
// census skip set (kept local; the two are independently small + stable).
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  'bin', 'obj', '.venv', 'venv', '__pycache__', '.next', '.cache', 'vendor',
  'coverage', '.worktrees',
]);

// Translate one path SEGMENT glob (* ? within a segment) to a RegExp. `*` → any
// run of non-slash chars, `?` → one non-slash char, everything else literal.
function segmentToRegex(seg) {
  const escaped = seg
    .split('')
    .map((ch) => {
      if (ch === '*') return '[^/]*';
      if (ch === '?') return '[^/]';
      if (/[.+^${}()|[\]\\]/.test(ch)) return '\\' + ch;
      return ch;
    })
    .join('');
  return new RegExp('^' + escaped + '$');
}

// The deepest LITERAL directory prefix of a pattern — the part before the first
// segment containing a wildcard. Used as the match's `subtree` for scope-gating
// (a match under packages/web/ is gated on the turn touching packages/web/).
// A pattern with no wildcard returns its own dirname.
function literalPrefix(pattern) {
  const segs = pattern.split('/');
  const out = [];
  for (const seg of segs) {
    if (seg.includes('*') || seg.includes('?')) break;
    out.push(seg);
  }
  // Drop a trailing filename segment only when the whole pattern is literal
  // (no wildcard at all): then the prefix is the file's directory.
  if (out.length === segs.length) out.pop();
  return out.join('/');
}

// Walk `root` collecting every file, relative-pathed, bounded by fileCap and
// SKIP_DIRS. Returns relative POSIX paths. Cheap-by-construction; the cap is the
// safety valve on a hostile tree.
function listFiles(root, fileCap) {
  const acc = [];
  const stack = [''];
  while (stack.length && acc.length < fileCap) {
    const rel = stack.pop();
    const abs = rel ? path.join(root, rel) : root;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue; // unreadable dir → skip, never throw
    }
    for (const ent of entries) {
      if (acc.length >= fileCap) break;
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        stack.push(childRel);
      } else if (ent.isFile()) {
        acc.push(childRel);
      }
    }
  }
  return acc;
}

// Build a matcher for a full pattern (possibly with `**`). Returns fn(relPosix)
// → boolean. `**` matches zero or more path segments; other segments match via
// segmentToRegex within a single segment.
function patternMatcher(pattern) {
  const segs = pattern.split('/');

  // Recursive segment-wise match: patSegs vs pathSegs, with `**` consuming any
  // number of path segments (including zero).
  function matchFrom(patSegs, pathSegs) {
    let pi = 0;
    let xi = 0;
    // Iterative with a single `**` backtrack point is insufficient for multiple
    // `**`; use a small recursive matcher (patterns are short).
    function rec(p, x) {
      if (p === patSegs.length) return x === pathSegs.length;
      if (patSegs[p] === '**') {
        // `**` matches zero+ segments: try consuming 0,1,2,... path segments.
        for (let k = x; k <= pathSegs.length; k++) {
          if (rec(p + 1, k)) return true;
        }
        return false;
      }
      if (x >= pathSegs.length) return false;
      if (!segmentToRegex(patSegs[p]).test(pathSegs[x])) return false;
      return rec(p + 1, x + 1);
    }
    return rec(pi + 0, xi + 0);
  }

  return function matches(relPosix) {
    return matchFrom(segs, relPosix.split('/'));
  };
}

// Expand ONE pattern against root → array of relative POSIX paths (sorted,
// deduped). For a literal path (no wildcard) it short-circuits to an existence
// check (no tree walk). For a wildcard pattern it walks once and filters.
function expandOne(pattern, root, { fileCap = 8000 } = {}) {
  const pat = String(pattern).replace(/\\/g, '/').replace(/^\.\//, '');
  const hasWild = pat.includes('*') || pat.includes('?');
  if (!hasWild) {
    const abs = path.join(root, pat);
    try {
      if (fs.statSync(abs).isFile()) return [pat];
    } catch {
      /* missing → no match */
    }
    return [];
  }
  const matcher = patternMatcher(pat);
  const all = listFiles(root, fileCap);
  const hits = all.filter(matcher);
  hits.sort();
  return hits;
}

// Expand an ARRAY of patterns → [{ file, relpath, subtree }], deduped by
// relpath, stable order (patterns in declared order, matches sorted within).
//   file    = absolute path
//   relpath = POSIX relative to root
//   subtree = the deepest literal directory prefix of the pattern that produced
//             the match (POSIX, '' for a project-root-level match) — the
//             scope-gating key.
function expandInstructionGlobs(patterns, root, { fileCap = 8000 } = {}) {
  const out = [];
  const seen = new Set();
  for (const pattern of patterns || []) {
    if (typeof pattern !== 'string' || !pattern.trim()) continue;
    const prefix = literalPrefix(String(pattern).replace(/\\/g, '/').replace(/^\.\//, ''));
    for (const rel of expandOne(pattern, root, { fileCap })) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      out.push({
        file: path.join(root, rel),
        relpath: rel,
        subtree: prefix,
      });
    }
  }
  return out;
}

module.exports = {
  expandInstructionGlobs,
  expandOne,
  literalPrefix,
  // exported for testing
  _segmentToRegex: segmentToRegex,
  _patternMatcher: patternMatcher,
};
