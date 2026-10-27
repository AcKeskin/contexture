#!/usr/bin/env node
'use strict';

// Per-edit checks that report only problems the edit added.
//
// Opt-in per project with .claude/edit-checks.json:
//   { "checks": [ { "glob": "*.ts", "command": "npx eslint --format unix {file}" } ] }
// `glob` without a slash matches the basename, with a slash the project-relative
// path. `{file}` becomes the quoted absolute path.
//
//   PreToolUse   first touch of a file this session: run the checks, save the
//                output as the baseline
//   PostToolUse  run them again; report lines missing from the baseline
//
// Lines are compared with line/column numbers stripped, so shifted findings
// don't count as new. A reported line joins the baseline, so it is reported
// once. With no baseline (no pre-edit event) the run becomes the baseline.
//
// The commands come from the repo, so they run only once the user trusts the
// file on this machine: `node edit-checks.js --trust [root]` stores its hash
// in ~/.claude/edit-checks-trusted.json. Any change to the file needs a new
// --trust. Advisory only. Fails open; a check that times out is skipped.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const io = require('./lib/hook-io');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const CONFIG_REL = '.claude/edit-checks.json';
const TIMEOUT_MS = 20000;
const MAX_LINES = 20;
const TRUST_FILE = path.join(io.homeClaude(), 'edit-checks-trusted.json');

function configHash(root) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, CONFIG_REL))).digest('hex');
  } catch {
    return null;
  }
}

function trustKey(root) {
  const k = io.normalise(path.resolve(root));
  return process.platform === 'win32' ? k.toLowerCase() : k;
}

function isTrusted(root) {
  const trusted = io.readJsonIfExists(TRUST_FILE) || {};
  const hash = configHash(root);
  return hash !== null && trusted[trustKey(root)] === hash;
}

function trust(root) {
  const hash = configHash(root);
  if (!hash) {
    console.log(`No ${CONFIG_REL} in ${root}.`);
    return;
  }
  const trusted = io.readJsonIfExists(TRUST_FILE) || {};
  trusted[trustKey(root)] = hash;
  fs.mkdirSync(path.dirname(TRUST_FILE), { recursive: true });
  fs.writeFileSync(TRUST_FILE, JSON.stringify(trusted, null, 2) + '\n');
  console.log(`Trusted ${CONFIG_REL} in ${root}. Edit it and you need to trust it again.`);
}

function checksFor(root, rel) {
  const cfg = io.readJsonIfExists(path.join(root, CONFIG_REL));
  const checks = (cfg && Array.isArray(cfg.checks) && cfg.checks) || [];
  return checks.filter((c) => {
    if (!c || typeof c.glob !== 'string' || typeof c.command !== 'string') return false;
    const subject = c.glob.includes('/') ? rel : path.basename(rel);
    return io.globToRegex(c.glob).test(subject);
  });
}

function run(checks, abs, root) {
  const lines = [];
  for (const c of checks) {
    const cmd = c.command.split('{file}').join(JSON.stringify(abs));
    let out = '';
    try {
      out = execSync(cmd, { cwd: root, timeout: TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      if (err.signal) continue;
      out = (err.stdout || '') + (err.stderr || '');
    }
    for (const line of out.split(/\r?\n/)) if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

function key(line) {
  return line.replace(/[:(\[]\d+(?:[:,]\d+)?[)\]]?/g, '').replace(/\s+/g, ' ');
}

async function main() {
  const trustAt = process.argv.indexOf('--trust');
  if (trustAt !== -1) return trust(path.resolve(process.argv[trustAt + 1] || io.projectRoot()));

  const payload = await io.readPayload();
  if (!WRITE_TOOLS.has(payload.tool_name)) return io.allow();
  const input = payload.tool_input || {};
  const raw = input.file_path || input.notebook_path || input.path;
  if (!raw) return io.allow();

  const root = path.resolve(io.projectRoot());
  const abs = io.resolvePath(raw);
  if (!io.isDescendant(abs, root)) return io.allow();
  const rel = io.normalise(path.relative(root, abs));
  const checks = checksFor(root, rel);
  if (checks.length === 0) return io.allow();

  const statePath = io.hookStateFile('edit-checks', io.sessionId(payload));
  const state = io.readJsonIfExists(statePath) || {};
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state) + '\n');

  if (!isTrusted(root)) {
    if (payload.hook_event_name !== 'PreToolUse' || state.untrustedNoticed) return io.allow();
    state.untrustedNoticed = true;
    save();
    return io.addContext(
      'PreToolUse',
      `${CONFIG_REL} is not trusted on this machine, so its checks did not run. It runs:\n` +
        checks.map((c) => '- ' + c.command).join('\n') +
        `\nAsk the user before trusting it. To trust: node ${JSON.stringify(io.normalise(__filename))} --trust ${JSON.stringify(io.normalise(root))}`
    );
  }

  const files = state.files || (state.files = {});
  if (payload.hook_event_name === 'PreToolUse') {
    if (files[rel]) return io.allow();
    files[rel] = fs.existsSync(abs) ? run(checks, abs, root).map(key) : [];
    save();
    return io.allow();
  }

  if (payload.hook_event_name !== 'PostToolUse') return io.allow();
  const lines = run(checks, abs, root);
  if (!files[rel]) {
    files[rel] = lines.map(key);
    save();
    return io.allow();
  }
  const baseline = new Set(files[rel]);
  const fresh = lines.filter((l) => !baseline.has(key(l)));
  if (fresh.length === 0) return io.allow();
  files[rel] = [...baseline, ...fresh.map(key)];
  save();
  const shown = fresh.slice(0, MAX_LINES).join('\n');
  const more = fresh.length > MAX_LINES ? `\n(${fresh.length - MAX_LINES} more)` : '';
  io.advise(`Checks from ${CONFIG_REL} report new problems in ${rel}:\n${shown}${more}`);
}

main().catch(() => io.allow());
