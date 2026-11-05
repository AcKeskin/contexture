#!/usr/bin/env node
'use strict';

// Command facts: notice when a command is not found here but another spelling
// of it works, and after a few sessions offer to save that as a memory.
//
//   PostToolUseFailure (Bash)   "pytest: command not found" -> remember pytest failed
//   PostToolUse (Bash)          a later "python -m pytest" works -> one confirmation
//                               of "pytest -> python -m pytest" for this session.
//                               A plain "pytest ..." that works retires the fact.
//   SessionStart (startup)      a fact confirmed in SESSIONS sessions: ask Claude to
//                               offer /capture once. It never writes a memory.
//
// Ledger: ~/.claude/command-facts.json, keyed by project root. Only environment
// errors count (not found, not recognized, no module), never test failures.
// From microsoft/TokenEconomizer's "form repair" micro-skill (read 2026-11-05).
// Advisory only. Fails open.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const LEDGER = () => path.join(io.homeClaude(), 'command-facts.json');
const PAIR_WINDOW = 5; // a success must come within this many Bash calls of the failure
const MAX_FACTS = 30;
const NOT_FOUND = [
  /(?:^|\s|:)([\w.+-]+): (?:command )?not found/m,
  /'([\w.+-]+)' is not recognized as an internal or external command/m,
  /The term '([\w.+-]+)' is not recognized/m,
  /No module named '?([\w.-]+)'?/m,
  /spawn ([\w.+-]+) ENOENT/m,
];
const SKIP_WORDS = new Set(['sudo', 'env', 'time', 'nohup', 'exec']);
// The word right before the name in a working form: python -m X, npx X, uv run X.
// Anything else (pip install X, which X) is not another way to run X.
const LAUNCHERS = new Set(['-m', 'npx', 'bunx', 'pnpx', 'uvx', 'yarn', 'exec', 'dlx', 'run']);

function sessions() {
  const n = io.hookConfig('commandFacts').sessions;
  return typeof n === 'number' && n > 0 ? n : 3;
}

function segments(cmd) {
  return String(cmd || '')
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// First real word of a segment: skips VAR=x, sudo, env.
function program(seg) {
  for (const w of seg.split(/\s+/)) {
    if (/^\w+=/.test(w) || SKIP_WORDS.has(w)) continue;
    return path.basename(w);
  }
  return '';
}

function missingName(error) {
  for (const re of NOT_FOUND) {
    const m = re.exec(String(error || ''));
    if (m) return m[1];
  }
  return null;
}

// "python -m pytest tests/ -q" with name pytest -> "python -m pytest".
function workingForm(cmd, name) {
  for (const seg of segments(cmd)) {
    const words = seg.split(/\s+/);
    const i = words.indexOf(name);
    if (i > 0 && program(seg) !== name && LAUNCHERS.has(words[i - 1])) return words.slice(0, i + 1).join(' ');
  }
  return null;
}

function readLedger() {
  return io.readJsonIfExists(LEDGER()) || {};
}

function writeLedger(l) {
  try {
    fs.mkdirSync(path.dirname(LEDGER()), { recursive: true });
    fs.writeFileSync(LEDGER(), JSON.stringify(l, null, 2) + '\n');
  } catch {
    // Not fatal: this session's confirmation is lost.
  }
}

function onFailure(payload, st) {
  const name = missingName(payload.error);
  if (!name) return;
  const progs = segments(payload.tool_input && payload.tool_input.command).map(program);
  // "No module named pytest" from "pytest ..." or from "python -m pytest": both are pytest.
  // From "python app.py" it is a missing dependency, not a spelling.
  const cmd = String((payload.tool_input && payload.tool_input.command) || '');
  if (!progs.includes(name) && !cmd.split(/\s+/).some((w, i, a) => w === name && a[i - 1] === '-m')) return;
  st.pending = st.pending.filter((p) => p.name !== name).concat({ name, left: PAIR_WINDOW });
}

function onSuccess(payload, st, sid) {
  const cmd = payload.tool_input && payload.tool_input.command;
  const root = io.normalise(io.projectRoot());
  const ledger = readLedger();
  const facts = ledger[root] || {};
  const progs = segments(cmd).map(program);
  let changed = false;

  // The failing spelling works after all: retire its facts.
  for (const prog of progs) {
    for (const key of Object.keys(facts)) {
      if (facts[key].failing === prog) {
        delete facts[key];
        changed = true;
      }
    }
  }

  for (const p of st.pending) {
    if (progs.includes(p.name)) {
      p.left = 0; // the plain spelling works now (e.g. after an install)
      continue;
    }
    const form = workingForm(cmd, p.name);
    if (!form) continue;
    const key = p.name + ' -> ' + form;
    const f = facts[key] || { failing: p.name, works: form, sessions: [], proposed: false };
    if (!f.sessions.includes(sid)) f.sessions = f.sessions.concat(sid).slice(-10);
    facts[key] = f;
    p.left = 0;
    changed = true;
  }
  st.pending = st.pending.map((p) => ({ ...p, left: p.left - 1 })).filter((p) => p.left > 0);

  if (changed) {
    const keys = Object.keys(facts);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_FACTS))) delete facts[k];
    if (Object.keys(facts).length) ledger[root] = facts;
    else delete ledger[root];
    writeLedger(ledger);
  }
}

function onStart() {
  const root = io.normalise(io.projectRoot());
  const ledger = readLedger();
  const facts = ledger[root] || {};
  const ready = Object.values(facts).filter((f) => !f.proposed && f.sessions.length >= sessions());
  if (!ready.length) return io.allow();
  for (const f of ready) f.proposed = true;
  writeLedger(ledger);
  const lines = ready.map((f) => `- \`${f.failing}\` is not found here; \`${f.works}\` works (seen in ${f.sessions.length} sessions).`);
  io.addContext(
    'SessionStart',
    'Command facts for this project (automated):\n' +
      lines.join('\n') +
      '\nUse the working form. Once this session, offer the user to save these as a project memory with /capture. Do not write the memory yourself.'
  );
}

async function main() {
  const payload = await io.readPayload();
  const event = payload.hook_event_name;
  if (event === 'SessionStart') return onStart();
  if (payload.tool_name !== 'Bash') return io.allow();
  if (event !== 'PostToolUse' && event !== 'PostToolUseFailure') return io.allow();

  const sid = io.sessionId(payload);
  const sp = io.hookStateFile('command-facts', sid);
  const st = io.readJsonIfExists(sp) || { pending: [] };
  if (event === 'PostToolUseFailure') onFailure(payload, st);
  else onSuccess(payload, st, sid);
  try {
    fs.writeFileSync(sp, JSON.stringify(st) + '\n');
  } catch {
    // Not fatal.
  }
  io.allow();
}

main().catch(() => io.allow());
