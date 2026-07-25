#!/usr/bin/env node
'use strict';

// Custom Claude Code statusline. Reads the session JSON on stdin and renders a
// single line: model | directory | git | context-window% | cost | elapsed | burn.
// Self-contained (no deps): JSON + transcript parsing are native, git is one
// spawn. Every segment is best-effort — a missing/unreadable field drops that
// segment rather than failing the line, since a crashing statusline shows nothing.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const useColor = !process.env.NO_COLOR;
const C = {
  reset: s => wrap(s, 0),
  dim: s => wrap(s, 2),
  cyan: s => wrap(s, 36),
  green: s => wrap(s, 32),
  yellow: s => wrap(s, 33),
  red: s => wrap(s, 31),
  magenta: s => wrap(s, 35),
  blue: s => wrap(s, 34),
};
function wrap(s, code) {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s);
}

function main() {
  const data = readInput();
  const segments = [
    modelSegment(data),
    dirSegment(data),
    gitSegment(data),
    contextSegment(data),
    costSegment(data),
    elapsedSegment(data),
    burnSegment(data),
  ].filter(Boolean);

  process.stdout.write(segments.join(C.dim(' │ ')));
}

function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function modelSegment(d) {
  const name = d.model && (d.model.display_name || d.model.id);
  return name ? C.cyan(name) : null;
}

function dirSegment(d) {
  const dir = currentDir(d);
  if (!dir) return null;
  return C.blue(path.basename(dir));
}

function currentDir(d) {
  return (d.workspace && d.workspace.current_dir) || d.cwd || null;
}

// One `git status` call yields branch, upstream ahead/behind, and dirty count.
function gitSegment(d) {
  const dir = currentDir(d);
  if (!dir) return null;
  let out;
  try {
    out = execFileSync('git', ['-C', dir, 'status', '--porcelain=v2', '--branch'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    });
  } catch {
    return null; // not a repo, or git unavailable
  }

  let branch = null;
  let ahead = 0;
  let behind = 0;
  let dirty = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
    } else if (line && !line.startsWith('#')) {
      dirty++;
    }
  }
  if (!branch) return null;
  if (branch === '(detached)') branch = 'detached';

  let s = C.green(branch);
  if (dirty > 0) s += ' ' + C.yellow('●' + dirty);
  if (ahead > 0) s += ' ' + C.dim('↑' + ahead);
  if (behind > 0) s += ' ' + C.dim('↓' + behind);
  return s;
}

// Context occupancy = tokens the last turn actually sent (input + both caches),
// read from the tail of the transcript JSONL. Colored by fill.
function contextSegment(d) {
  const tp = d.transcript_path;
  if (!tp || !fs.existsSync(tp)) return null;

  const used = lastContextTokens(tp);
  if (used == null) return null;

  const limit = contextLimit(d);
  const pct = Math.round((used / limit) * 100);
  const leftK = fmtTokens(Math.max(0, limit - used));

  const label = `ctx ${pct}%`;
  let colored;
  if (pct >= 90) colored = C.red(label);
  else if (pct >= 70) colored = C.yellow(label);
  else colored = C.green(label);

  return `${colored} ${C.dim('(' + leftK + ' left)')}`;
}

function lastContextTokens(transcriptPath) {
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const u = entry && entry.message && entry.message.usage;
    if (u && typeof u.input_tokens === 'number') {
      return (
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0)
      );
    }
  }
  return null;
}

function contextLimit(d) {
  const id = (d.model && (d.model.id || d.model.display_name) || '').toLowerCase();
  return /\[1m\]|\b1m\b/.test(id) ? 1_000_000 : 200_000;
}

function costSegment(d) {
  const usd = d.cost && d.cost.total_cost_usd;
  if (typeof usd !== 'number') return null;
  return C.magenta('$' + usd.toFixed(usd < 1 ? 3 : 2));
}

function elapsedSegment(d) {
  const ms = d.cost && d.cost.total_duration_ms;
  if (typeof ms !== 'number' || ms <= 0) return null;
  return C.dim(fmtDuration(ms));
}

// $/hour extrapolated from session cost and wall-clock so far. Skipped for very
// short sessions where the rate is meaningless.
function burnSegment(d) {
  const usd = d.cost && d.cost.total_cost_usd;
  const ms = d.cost && d.cost.total_duration_ms;
  if (typeof usd !== 'number' || typeof ms !== 'number' || ms < 30_000) return null;
  const perHour = usd / (ms / 3_600_000);
  return C.dim('$' + perHour.toFixed(2) + '/h');
}

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}

function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

main();
