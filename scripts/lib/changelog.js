'use strict';

// Deterministic changelog generation for the public snapshot.
//
// Computes the file-level diff between the current public HEAD (already checked
// out in the target before the new tree is laid down) and the new working tree,
// groups changed paths by area, and PREPENDS a dated entry to CHANGELOG.md in
// the target. Factual and reproducible — no prose judgment, no hallucination.
// The maintainer curates the entry into richer prose before pushing if desired.
//
// Called after transforms + `git add -A`, before the commit, so CHANGELOG.md is
// part of the committed tree.

const path = require('path');

// Map a changed path to a human area bucket. Order matters — first match wins.
const AREAS = [
  [/^skills\//, 'Skills'],
  [/^hooks\//, 'Hooks'],
  [/^architectural-rules\//, 'Architectural rules'],
  [/^commands\//, 'Commands'],
  [/^agents\//, 'Agents'],
  [/^mcps\//, 'MCP servers'],
  [/^bootstrap\//, 'Bootstrap'],
  [/^settings\//, 'Settings'],
  [/^docs\//, 'Docs'],
  [/^\.github\//, 'Cross-tool instructions'],
  [/^claude-md\//, 'CLAUDE.md imports'],
];

function areaOf(p) {
  for (const [re, name] of AREAS) if (re.test(p)) return name;
  return 'Other';
}

// run: ctx.run; target: snapshot dir; returns { entry, counts } or null if no
// diff. `headerMsg` is the curated commit message used as the entry title.
function buildChangelogEntry({ run, target, headerMsg, dateStr }) {
  // Diff the staged index (the new tree) against HEAD (public head). --cached so
  // it reflects exactly what will be committed. Name-status gives A/M/D.
  let raw;
  try {
    raw = run('git', ['diff', '--cached', '--name-status', 'HEAD'], { cwd: target }).toString();
  } catch {
    // No HEAD yet (first-ever commit) → diff against empty tree.
    raw = run('git', ['diff', '--cached', '--name-status'], { cwd: target }).toString();
  }

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const byArea = new Map(); // area -> { added:[], changed:[], removed:[] }
  const counts = { added: 0, changed: 0, removed: 0 };
  for (const line of lines) {
    const [status, ...rest] = line.split('\t');
    const file = rest[rest.length - 1]; // for renames, the new path
    const area = areaOf(file);
    if (!byArea.has(area)) byArea.set(area, { added: [], changed: [], removed: [] });
    const bucket = byArea.get(area);
    const code = status[0];
    if (code === 'A') { bucket.added.push(file); counts.added++; }
    else if (code === 'D') { bucket.removed.push(file); counts.removed++; }
    else { bucket.changed.push(file); counts.changed++; } // M, R, C, T
  }

  // Render a dated entry. Areas alphabetical for stable output.
  const out = [];
  out.push(`## ${dateStr} — ${headerMsg}`);
  out.push('');
  out.push(`_${counts.added} added, ${counts.changed} changed, ${counts.removed} removed._`);
  out.push('');
  for (const area of [...byArea.keys()].sort()) {
    const b = byArea.get(area);
    out.push(`### ${area}`);
    for (const f of b.added.sort()) out.push(`- added \`${f}\``);
    for (const f of b.changed.sort()) out.push(`- changed \`${f}\``);
    for (const f of b.removed.sort()) out.push(`- removed \`${f}\``);
    out.push('');
  }
  return { entry: out.join('\n').trimEnd() + '\n', counts };
}

// Prepend the entry beneath the CHANGELOG.md title (creating the file if absent).
function prependEntry({ read, write, exists, target, entry }) {
  const file = path.join(target, 'CHANGELOG.md');
  const TITLE = '# Changelog\n\nFile-level changes per public snapshot. Curate freely — this is the human-facing history.\n';
  let body = '';
  if (exists(file)) {
    const cur = read(file);
    const idx = cur.indexOf('\n## ');
    if (cur.startsWith('# Changelog')) {
      // insert the new entry right after the title block, before the first entry
      const head = idx === -1 ? cur.trimEnd() + '\n' : cur.slice(0, idx + 1);
      const tail = idx === -1 ? '' : cur.slice(idx + 1);
      body = head + '\n' + entry + '\n' + tail;
    } else {
      body = TITLE + '\n' + entry + '\n' + cur;
    }
  } else {
    body = TITLE + '\n' + entry;
  }
  write(file, body);
  return file;
}

module.exports = { buildChangelogEntry, prependEntry, areaOf };
