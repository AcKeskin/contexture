#!/usr/bin/env node
// BACKLOG-shipped-row sweep — step 6 of /wrap.
// Detects BACKLOG.md priority-queue rows whose proposal number already appears
// as a shipped `✓ <n>` line in CHANGELOG.md or as a `<date>-<slug>` close-out
// archive folder — the orphan-row case no other organ catches independent of a
// ship event. Prints candidates as JSON; the /wrap skill proposes their
// retirement behind an accept/edit/reject gate. This script NEVER edits BACKLOG.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// A BACKLOG priority-queue data row: | rank | # | subsystem | title | ... |
// Column 2 is the proposal id (e.g. "42", "17-v2", "8+9").
const BACKLOG_ROW = /^\|\s*\d+\s*\|\s*([^|]+?)\s*\|/;
// A CHANGELOG shipped line: "- ✓ <id> <desc>" — id is the leading token(s).
const CHANGELOG_SHIP = /^-\s*✓\s*([0-9]+(?:[+→][0-9a-z-]+)*)/u;

/** Extract the bare proposal numbers from a BACKLOG id cell ("035+037" → [035,037]). */
function idsFrom(cell) {
  return (cell.match(/\d{2,3}/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ''));
}

/** Set of proposal numbers recorded as shipped in CHANGELOG + archive folders. */
function shippedNumbers(changelogPath, archiveDir) {
  const shipped = new Set();

  if (existsSync(changelogPath)) {
    for (const line of readFileSync(changelogPath, 'utf8').split('\n')) {
      const m = line.match(CHANGELOG_SHIP);
      if (m) idsFrom(m[1]).forEach((n) => shipped.add(n));
    }
  }

  if (existsSync(archiveDir)) {
    for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // <date>-<slug>; slug may lead with a proposal number (100-session-...).
      const lead = entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, '');
      idsFrom(lead).forEach((n) => shipped.add(n));
    }
  }

  return shipped;
}

/** Rows on the BACKLOG whose every id is already shipped → retirement candidates. */
function sweep(backlogPath, shipped) {
  if (!existsSync(backlogPath)) return [];
  const candidates = [];
  const lines = readFileSync(backlogPath, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(BACKLOG_ROW);
    if (!m) return;
    const cell = m[1].trim();
    if (cell === '#' || cell === '') return; // header row
    // A continuation marker (a "-v2"-suffixed id) means follow-on work beyond what
    // shipped — the base proposal's presence in CHANGELOG does NOT mean this row
    // is done. Never sweep these; leave them for human judgment.
    if (/[→-]\s*v\d/i.test(cell)) return;
    const ids = idsFrom(cell);
    if (ids.length === 0) return;
    // Conservative: flag only when EVERY id in the cell is shipped — a partial
    // (e.g. "035+037" with one shipped) is left for human judgment, not swept.
    if (ids.every((n) => shipped.has(n))) {
      candidates.push({ line: i + 1, id: cell, ids, row: line.trim() });
    }
  });
  return candidates;
}

function main() {
  const root = process.argv[2] ?? process.cwd();
  const backlogPath = join(root, 'proposals', 'BACKLOG.md');
  const backlogPathAlt = join(root, 'BACKLOG.md'); // some projects root it
  const changelogPath = join(root, 'CHANGELOG.md');
  const archiveDir = join(root, '.claude', 'archive');

  const backlog = existsSync(backlogPath) ? backlogPath : backlogPathAlt;
  const shipped = shippedNumbers(changelogPath, archiveDir);
  const candidates = sweep(backlog, shipped);

  process.stdout.write(
    JSON.stringify(
      { backlog, changelog: changelogPath, archiveDir, shipped: [...shipped], candidates },
      null,
      2,
    ) + '\n',
  );
}

main();
