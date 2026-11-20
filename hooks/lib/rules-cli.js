#!/usr/bin/env node
'use strict';

// List, disable and enable architectural rules from outside a model turn.
// The contexture-ui mod's Rules tab runs it; it finds this file through the
// path rule-prime records in ~/.claude/session-state.json.
//
//   node rules-cli.js list --cwd <project>
//   node rules-cli.js disable <scope>/<name> --cwd <project> [--project]
//   node rules-cli.js enable <scope>/<name> --cwd <project>
//
// Writes the same manifests /rules disable and /rules enable do
// (docs/architectural-rules-overlay.md): the user manifest by default, the
// project manifest with --project; enable takes the key out of the project
// manifest first, else the user one. A locked company rule is refused:
// /rules disable asks about the lock and records the divergence.
// Prints JSON on stdout; on a refusal, a line on stderr and exit 1.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { listRules } = require('./resolve-rules');

const KEY = /^[\w.-]+\/[\w.-]+$/;

function userManifest() {
  return path.join(os.homedir(), '.claude', 'architectural-rules.config.yaml');
}

function projectManifest(cwd) {
  return path.join(cwd, '.claude', 'rules.config.yaml');
}

// The top-level `disabled:` line's index, or -1. A flow list (`disabled: [a]`)
// other than `[]` returns -2: the resolver does not read that form, so it is
// left for a person to fix rather than rewritten.
function disabledHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^disabled:\s*(.*?)\s*(#.*)?$/);
    if (!m) continue;
    if (m[1] === '' || m[1] === '[]') return i;
    return -2;
  }
  return -1;
}

// The block's item lines follow the header: indented or blank lines.
function blockEnd(lines, header) {
  let end = header + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++;
  return end;
}

function isItem(line, key) {
  const m = line.match(/^\s*-\s*(.+?)\s*(#.*)?$/);
  return m !== null && m[1].replace(/^(['"])(.*)\1$/, '$2') === key;
}

function addDisabled(text, key) {
  const lines = text === '' ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/);
  const header = disabledHeader(lines);
  if (header === -2) throw new Error('its disabled: list is written inline; use /rules disable');
  if (header === -1) {
    if (lines.length === 0) lines.push('version: 1');
    lines.push('disabled:', `  - ${key}`);
    return lines.join('\n') + '\n';
  }
  lines[header] = lines[header].replace(/\[\]\s*/, '').replace(/\s+$/, '');
  const end = blockEnd(lines, header);
  const items = lines.slice(header + 1, end);
  if (items.some((l) => isItem(l, key))) return null;
  // After the last item, so trailing blank lines stay where they were.
  let at = end;
  while (at > header + 1 && lines[at - 1].trim() === '') at--;
  const indent = (items.find((l) => /^\s*-/.test(l)) || '  -').match(/^\s*/)[0];
  lines.splice(at, 0, `${indent}- ${key}`);
  return lines.join('\n') + '\n';
}

function removeDisabled(text, key) {
  const lines = text.replace(/\r?\n$/, '').split(/\r?\n/);
  const header = disabledHeader(lines);
  if (header < 0) return null;
  const end = blockEnd(lines, header);
  const kept = lines.filter((l, i) => i <= header || i >= end || !isItem(l, key));
  return kept.length === lines.length ? null : kept.join('\n') + '\n';
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function disable(key, cwd, isProject) {
  const rule = listRules({ cwd }).find((r) => r.key === key);
  if (!rule) throw new Error(`no rule ${key}`);
  if (rule.isLocked) throw new Error(`${key} is locked by your company rules; use /rules disable ${key}`);
  const file = isProject ? projectManifest(cwd) : userManifest();
  const next = addDisabled(readText(file), key);
  if (next !== null) write(file, next);
  return { key, manifest: file, isChanged: next !== null };
}

function enable(key, cwd) {
  for (const file of [projectManifest(cwd), userManifest()]) {
    const next = removeDisabled(readText(file), key);
    if (next === null) continue;
    write(file, next);
    return { key, manifest: file, isChanged: true };
  }
  return { key, isChanged: false };
}

function main(argv) {
  const [command, ...rest] = argv;
  const cwdAt = rest.indexOf('--cwd');
  const cwd = cwdAt >= 0 ? rest[cwdAt + 1] : process.cwd();
  const key = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--cwd');
  if (command === 'list') return { rules: listRules({ cwd }) };
  if (command !== 'disable' && command !== 'enable') throw new Error('usage: rules-cli.js list|disable|enable');
  if (!key || !KEY.test(key)) throw new Error('give a rule key as <scope>/<name>');
  return command === 'disable' ? disable(key, cwd, rest.includes('--project')) : enable(key, cwd);
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n');
  } catch (err) {
    process.stderr.write(`rules-cli: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { addDisabled, removeDisabled, main };
