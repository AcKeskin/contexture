#!/usr/bin/env node
// Saves a review run under .claude/reviews/<slug>/. Claude Code blocks Write/Edit
// under .claude/ in headless runs, so the skill writes a temp file in the project
// and this script moves it in.
//
//   node save-run.mjs <slug> json <tmp.json>   # v<N>.json + latest.json (N = next free)
//   node save-run.mjs <slug> md <tmp.md>       # v<N>.md + latest.md (N = latest json's)
//   node save-run.mjs <slug> latest <tmp.json> # latest.json only (--since working state)
//
// The temp file is deleted after a successful save. Prints the paths written.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [slug, kind, src] = process.argv.slice(2);
if (!slug || !['json', 'md', 'latest'].includes(kind) || !src || /[\\/]|\.\./.test(slug)) {
  console.error('usage: node save-run.mjs <slug> json|md|latest <tmp-file>');
  process.exit(2);
}

if (!existsSync(src)) {
  console.error('temp file not found: ' + src);
  process.exit(1);
}
const text = readFileSync(src, 'utf8');
if (kind !== 'md') {
  try {
    JSON.parse(text);
  } catch (err) {
    console.error(`not saved: ${src} is not valid JSON (${err.message})`);
    process.exit(1);
  }
}

// The project root, not wherever the shell happens to be.
const dir = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'reviews', slug);
mkdirSync(dir, { recursive: true });

const highest = (re) => Math.max(0, ...readdirSync(dir).map((f) => Number(re.exec(f)?.[1] || 0)));
const topJson = highest(/^v(\d+)\.json$/);
// Older runs may have only v<N>.md; never reuse their numbers.
const next = Math.max(topJson, highest(/^v(\d+)\.md$/)) + 1;

// Atomic: write next to the target, then rename over it.
function put(name) {
  const target = join(dir, name);
  writeFileSync(target + '.tmp', text);
  renameSync(target + '.tmp', target);
  return target;
}

const written = [];
if (kind === 'json') written.push(put(`v${next}.json`), put('latest.json'));
else if (kind === 'md') {
  if (!topJson) {
    console.error('save the json first: no v<N>.json in ' + dir);
    process.exit(1);
  }
  written.push(put(`v${topJson}.md`), put('latest.md'));
} else written.push(put('latest.json'));

if (existsSync(src)) rmSync(src);
console.log(written.join('\n'));
