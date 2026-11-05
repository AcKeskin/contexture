#!/usr/bin/env node
'use strict';

// Loop guard: notice when a turn keeps hitting the same failure and say so.
//
//   UserPromptSubmit                       new turn: reset the counts
//   PostToolUse (Bash, Write, Edit, ...)   count the call, and edits per file
//   PostToolUseFailure (any tool)          count the failure and its signature
//
// Stuck is a conjunction, so a hard task whose failures keep changing is left
// alone: at least MIN_CALLS calls, edits piling on one file (or scattered over
// several), many failures, and a share of them repeating an earlier one.
//
// First time per turn: one redirect that mirrors the agent's own actions back
// and asks for a different hypothesis. It never says stop. If the next window
// looks stuck too: one line for the user on how to interrupt. Never blocks.
//
// Thresholds start from microsoft/TokenEconomizer's loop guard defaults
// (loopguard/rules.py, read 2026-11-05) and can be changed per machine under
// "loopGuard" in ~/.claude/hook-config.json. Fails open.

const fs = require('fs');
const crypto = require('crypto');
const io = require('./lib/hook-io');

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const DEFAULTS = {
  minCalls: 20, // don't judge before the loop has run a while
  editChurn: 4, // edits to one file
  editFiles: 3, // or edits spread over this many files
  failures: 6, // failed calls in the window
  repeatShare: 0.2, // share of failures that repeat an earlier signature
  minRepeats: 2,
};

function thresholds() {
  const cfg = io.hookConfig('loopGuard');
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (typeof cfg[k] === 'number') out[k] = cfg[k];
  return out;
}

function fresh() {
  return { calls: 0, edits: {}, failures: 0, sigs: {}, repeats: 0 };
}

function initial() {
  return { window: fresh(), nudged: false, noticed: false, total: 0 };
}

function load(p) {
  const s = io.readJsonIfExists(p);
  return s && s.window ? s : initial();
}

function save(p, s) {
  try {
    fs.writeFileSync(p, JSON.stringify(s) + '\n');
  } catch {
    // Not fatal: the next call starts from an older count.
  }
}

// Same failure, different run: drop numbers, hex, quoted temp paths, spacing.
function signature(tool, text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Exit code \d+$/.test(l));
  const tail = lines.slice(-3).join(' | ').slice(0, 400);
  const norm = tail
    .replace(/0x[0-9a-f]+/gi, 'H')
    .replace(/\d+(\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return tool + ':' + crypto.createHash('sha1').update(norm).digest('hex').slice(0, 12);
}

function editTarget(input) {
  const raw = input && (input.file_path || input.notebook_path || input.path);
  return raw ? io.normalise(raw) : null;
}

function stuck(w, t) {
  const counts = Object.values(w.edits);
  const churn = counts.some((n) => n >= t.editChurn) || counts.length >= t.editFiles;
  return (
    w.calls >= t.minCalls &&
    churn &&
    w.failures >= t.failures &&
    w.repeats >= t.minRepeats &&
    w.repeats / w.failures >= t.repeatShare
  );
}

function redirect(w) {
  const edits = Object.entries(w.edits).sort((a, b) => b[1] - a[1]);
  const total = edits.reduce((n, [, c]) => n + c, 0);
  const busiest = edits.length ? edits[0][0] : 'one file';
  return (
    `Loop check (automated): this turn made ${total} edits across ${edits.length} file(s), most to \`${busiest}\`, ` +
    `and ${w.failures} calls failed, ${w.repeats} of them the same failure as before. This looks like a loop. ` +
    'Do not stop. Step back and try a different hypothesis: re-read what the failing check expects, ' +
    'consider a different file or cause than the ones you have been editing, and test the new idea before editing again.'
  );
}

function notice(total) {
  return (
    `Loop check (automated): still looks stuck after a redirect (${total} calls this turn). ` +
    'Tell the user in one line that this turn may be looping and that Esc interrupts it, then carry on.'
  );
}

async function main() {
  const payload = await io.readPayload();
  const event = payload.hook_event_name;
  const p = io.hookStateFile('loop-guard', io.sessionId(payload));

  if (event === 'UserPromptSubmit') {
    save(p, initial());
    return io.allow();
  }
  if (event !== 'PostToolUse' && event !== 'PostToolUseFailure') return io.allow();

  const s = load(p);
  const w = s.window;
  w.calls += 1;
  s.total += 1;

  if (event === 'PostToolUseFailure') {
    if (!payload.is_interrupt) {
      w.failures += 1;
      const sig = signature(payload.tool_name, payload.error);
      if (w.sigs[sig]) w.repeats += 1;
      w.sigs[sig] = (w.sigs[sig] || 0) + 1;
    }
  } else if (EDIT_TOOLS.has(payload.tool_name)) {
    const f = editTarget(payload.tool_input);
    if (f) w.edits[f] = (w.edits[f] || 0) + 1;
  }

  if (s.noticed || !stuck(w, thresholds())) {
    save(p, s);
    return io.allow();
  }

  let msg;
  if (!s.nudged) {
    msg = redirect(w);
    s.nudged = true;
  } else {
    msg = notice(s.total);
    s.noticed = true;
  }
  s.window = fresh(); // a fair window to recover before judging again
  save(p, s);
  io.addContext(event, msg);
}

main().catch(() => io.allow());
