#!/usr/bin/env node
'use strict';

// PreToolUse hook (Write/Edit/MultiEdit/NotebookEdit): before the first edit
// of a file in a session, show the warning and lesson memories that name it.
// Rules load per prompt; this loads "what already failed here" per file.
//
// A memory names a file when its text contains the project-relative path, or
// the basename when the basename is specific enough (not index.ts, main.go...).
// Only memories with kind warning/lesson, or under warnings/ or lessons/, count.
//
// Advisory only, once per file per session. Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');
const { memoryRoot, listMemoryFiles } = require('./lib/memory-root');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const KIND_RE = /^\s*kind:\s*["']?(warning|lesson)\b/m;
const GENERIC_STEMS = new Set([
  'index', 'main', 'mod', 'lib', 'app', 'init', '__init__', 'readme', 'package',
  'config', 'settings', 'utils', 'util', 'helpers', 'types', 'test', 'setup',
]);
const MAX_HITS = 3;

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? m[1] : '';
}

function field(fm, key) {
  const m = new RegExp('^\\s*' + key + ':\\s*["\']?(.+?)["\']?\\s*$', 'm').exec(fm);
  return m ? m[1] : '';
}

function isWarningOrLesson(file, root, fm) {
  if (KIND_RE.test(fm)) return true;
  const top = io.normalise(path.relative(root, file)).split('/')[0];
  return top === 'warnings' || top === 'lessons';
}

function matchers(rel) {
  const base = path.basename(rel);
  const stem = base.replace(/\.[^.]+$/, '').toLowerCase();
  const out = [rel];
  if (base !== rel && !GENERIC_STEMS.has(stem) && stem.length >= 4) out.push(base);
  return out;
}

function findHits(root, rel) {
  const needles = matchers(rel);
  const hits = [];
  for (const file of listMemoryFiles(root)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const fm = frontmatter(text);
    if (/^\s*superseded_by:/m.test(fm)) continue;
    if (!isWarningOrLesson(file, root, fm)) continue;
    if (!needles.some((n) => text.includes(n))) continue;
    hits.push({
      name: field(fm, 'name') || path.basename(file, '.md'),
      description: field(fm, 'description'),
      rel: io.normalise(path.relative(root, file)),
    });
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

function alreadySeen(sessionId, rel) {
  const p = io.hookStateFile('file-history', sessionId);
  const seen = io.readJsonIfExists(p) || [];
  if (seen.includes(rel)) return true;
  try {
    fs.writeFileSync(p, JSON.stringify([...seen, rel]) + '\n');
  } catch {
    // Not fatal: worst case the same file warns twice.
  }
  return false;
}

async function main() {
  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();
  const input = payload.tool_input || {};
  const raw = input.file_path || input.notebook_path || input.path;
  if (!raw) return io.allow();

  const projectDir = io.projectRoot();
  const target = io.resolvePath(raw);
  if (!io.isDescendant(target, projectDir)) return io.allow();
  const rel = io.normalise(path.relative(path.resolve(projectDir), target));

  const root = memoryRoot(projectDir);
  if (!root) return io.allow();
  if (alreadySeen(io.sessionId(payload), rel)) return io.allow();

  const hits = findHits(root, rel);
  if (hits.length === 0) return io.allow();

  const lines = hits.map((h) => `- ${h.name}${h.description ? ': ' + h.description : ''} (memory/${h.rel})`);
  io.addContext(
    'PreToolUse',
    `Recorded warnings or lessons name ${rel}. Read them before this edit if they apply:\n${lines.join('\n')}`
  );
}

main().catch(() => io.allow());
