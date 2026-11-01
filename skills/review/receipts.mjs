#!/usr/bin/env node
// Review receipts: a content hash of every file a review read, so the next run
// knows which files changed without trusting git state or mtimes (mtimes lie
// after restores and cloud sync). Prints facts, never verdicts; the calling
// skill decides what to re-read.
//
//   node receipts.mjs stamp <dir> [--list <file>] <path>...   # write <dir>/receipt.json
//   node receipts.mjs check <dir> [--list <file>] [<path>...] # one line per path
//
// <dir> is relative to the project root and must sit under .claude/
// (e.g. .claude/reviews/src-auth). Paths inside the project are stored
// project-relative; paths outside it (user rule files, the memory tree) are
// stored absolute, with the home dir as ~. Folders are skipped. --list reads
// one path per line from a file, for scopes too long for a command line;
// a list named .review-run.tmp.txt is deleted after reading.
//
// check prints `UNCHANGED|CHANGED|NEW|GONE <path>` for every path given and
// every path the receipt stamped, or `RECEIPT: NONE` when there is no receipt.
// A given path that was never stamped and does not exist prints nothing.
// A stamped path that no longer exists is GONE. Exit 0 either way.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node receipts.mjs stamp|check <.claude/...dir> [--list <file>] [<path>...]');
  process.exit(2);
}

const [mode, dirArg, ...rest] = process.argv.slice(2);
if (!['stamp', 'check'].includes(mode) || !dirArg) usage();
const dirRel = normalize(dirArg).split(sep).join('/');
if (isAbsolute(dirArg) || dirRel.startsWith('..') || !dirRel.startsWith('.claude/')) usage('dir must be a relative path under .claude/');
const receiptFile = join(root, dirRel, 'receipt.json');

const paths = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--list') {
    const list = rest[++i];
    if (!list || !existsSync(list)) usage('--list file not found: ' + list);
    paths.push(...readFileSync(list, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    // The review skill's temp list is ours to clean up.
    if (basename(list) === '.review-run.tmp.txt') rmSync(list);
  } else paths.push(rest[i]);
}
const home = homedir();
const slash = (p) => p.split(sep).join('/');
const toKey = (p) => {
  const abs = resolve(root, p.replace(/^~(?=[\\/])/, home));
  const rel = relative(root, abs);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return slash(rel);
  const fromHome = relative(home, abs);
  return fromHome && !fromHome.startsWith('..') && !isAbsolute(fromHome) ? '~/' + slash(fromHome) : slash(abs);
};
const keys = [...new Set(paths.map(toKey))];

function hash(key) {
  const file = key.startsWith('~/') ? join(home, key.slice(2)) : resolve(root, key);
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (mode === 'stamp') {
  if (!keys.length) usage('stamp needs at least one path');
  const files = {};
  const missing = [];
  for (const k of keys) {
    const h = hash(k);
    if (h) files[k] = h;
    else missing.push(k);
  }
  mkdirSync(join(root, dirRel), { recursive: true });
  const body = JSON.stringify({ stamped: new Date().toISOString(), files }, null, 2) + '\n';
  writeFileSync(receiptFile + '.tmp', body);
  renameSync(receiptFile + '.tmp', receiptFile);
  console.log(`stamped ${Object.keys(files).length} file(s) in ${dirRel}/receipt.json`);
  for (const m of missing) console.log(`SKIPPED (not a file) ${m}`);
  process.exit(0);
}

if (!existsSync(receiptFile)) {
  console.log('RECEIPT: NONE');
  process.exit(0);
}
let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
} catch {
  console.log('RECEIPT: NONE (unreadable; treat every file as changed)');
  process.exit(0);
}
const stamped = receipt.files || {};
console.log(`RECEIPT: ${receipt.stamped || 'undated'}`);
for (const k of [...new Set([...keys, ...Object.keys(stamped)])].sort()) {
  const now = hash(k);
  if (!(k in stamped)) {
    if (now) console.log(`NEW ${k}`);
    continue;
  }
  if (!now) console.log(`GONE ${k}`);
  else console.log(`${now === stamped[k] ? 'UNCHANGED' : 'CHANGED'} ${k}`);
}
