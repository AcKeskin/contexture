#!/usr/bin/env node
'use strict';

// Check a skill trace (written by hooks/skill-trace.js) against how each skill
// is designed to run. Run by /flow-check.
//
//   node flow-check.js                 newest trace in <project>/.claude/trace/
//   node flow-check.js <file.jsonl>    that trace
//
// Checks:
//   review, dispatch  agents start together: two lone agents in a row = ran one at a time
//   execute           every step's edits are followed by a check (Bash, Read, Grep,
//                     Glob or a question) before the step's scratch record
//
// Prints one line per skill run: PASS, FAIL, NOTE or SKIP.
// Exit 1 if any run fails.

const fs = require('fs');
const path = require('path');

const ALIASES = { 'pr-review': 'review', status: 'work-state' };
const AGENT_TOOLS = new Set(['Agent', 'Task']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const CHECK_TOOLS = new Set(['Bash', 'Read', 'Grep', 'Glob', 'AskUserQuestion']);

function skillName(raw) {
  const name = String(raw).split(':').pop();
  return ALIASES[name] || name;
}

function readTrace(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Pair pre/post lines into calls with start and end times.
function toCalls(lines) {
  const byId = new Map();
  const calls = [];
  for (const l of lines) {
    if (l.ev === 'prompt') continue;
    const open = l.id && byId.get(l.id);
    if (l.ev === 'pre') {
      const call = { ...l, start: l.t, end: null, ok: null };
      calls.push(call);
      if (l.id) byId.set(l.id, call);
    } else if (open) {
      open.end = l.t;
      open.ok = l.ev === 'post';
    } else {
      calls.push({ ...l, start: l.t, end: l.t, ok: l.ev === 'post' });
    }
  }
  return calls;
}

// A run starts at any typed /skill, or at a main-thread Skill call for a checked
// skill, and lasts until the next start. Skills called inside a run (say, /execute
// calling test-driven-development) do not end it.
function toRuns(lines, calls) {
  const starts = [];
  for (const l of lines) {
    const typed = l.ev === 'prompt' && l.skill;
    const called = l.ev === 'pre' && l.tool === 'Skill' && l.skill && !l.agent && CHECKS[skillName(l.skill)];
    if (typed || called) starts.push({ skill: skillName(l.skill), t: l.t });
  }
  const runs = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].t : Infinity;
    return {
      skill: s.skill,
      t: s.t,
      calls: calls.filter((c) => c.start > s.t && c.start < end),
    };
  });
  // A typed /review followed by its own Skill call is one run, not two.
  return runs.filter((r, i) => !(r.calls.length === 0 && runs[i + 1] && runs[i + 1].skill === r.skill));
}

// Group agents by start order: a new wave starts once every agent in the current one has ended.
function waves(agents) {
  const out = [];
  let wave = [];
  let waveEnd = -Infinity;
  for (const a of [...agents].sort((x, y) => x.start - y.start)) {
    if (wave.length && a.start >= waveEnd) {
      out.push(wave);
      wave = [];
      waveEnd = -Infinity;
    }
    wave.push(a);
    waveEnd = Math.max(waveEnd, a.end);
  }
  if (wave.length) out.push(wave);
  return out;
}

function checkParallel(run) {
  // Agents with no end were denied or are still running: left out.
  const agents = run.calls.filter((c) => AGENT_TOOLS.has(c.tool) && !c.agent && c.end != null);
  if (agents.length < 2) return { status: 'SKIP', why: `${agents.length} agent(s), nothing to compare` };
  const sizes = waves(agents).map((w) => w.length);
  const lone = sizes.some((n, i) => n === 1 && sizes[i + 1] === 1);
  return lone
    ? { status: 'FAIL', why: `agents ran one at a time (waves ${sizes.join(',')}); designed to start in one message` }
    : { status: 'PASS', why: `agents started together (waves ${sizes.join(',')})` };
}

function checkExecute(run) {
  const calls = [...run.calls].sort((a, b) => a.start - b.start);
  const isMark = (c) => /__write_memory$/.test(c.tool) && c.tier === 'scratch';
  if (!calls.some(isMark)) {
    return calls.some((c) => EDIT_TOOLS.has(c.tool))
      ? { status: 'SKIP', why: 'edits but no scratch records, so step bounds are unknown (is project-memory connected?)' }
      : { status: 'SKIP', why: 'no steps recorded' };
  }
  const steps = [];
  let current = [];
  for (const c of calls) {
    if (isMark(c)) {
      steps.push({ calls: current, marked: true });
      current = [];
    } else current.push(c);
  }
  if (current.length) steps.push({ calls: current, marked: false });
  const unchecked = [];
  let trailing = false;
  steps.forEach((s, i) => {
    const lastEdit = s.calls.map((c) => EDIT_TOOLS.has(c.tool)).lastIndexOf(true);
    if (lastEdit < 0) return;
    if (s.calls.slice(lastEdit + 1).some((c) => CHECK_TOOLS.has(c.tool))) return;
    if (s.marked) unchecked.push(i + 1);
    else trailing = true;
  });
  const marked = steps.filter((s) => s.marked).length;
  if (unchecked.length) return { status: 'FAIL', why: `step ${unchecked.join(', ')}: edits with no check before the step was recorded` };
  // Edits after the last record may be the next step still running, or work done
  // after /execute ended: a note, not a failure.
  if (trailing) return { status: 'NOTE', why: `${marked} step(s) checked; later edits not checked (next step running, or work after /execute)` };
  return { status: 'PASS', why: `${marked} step(s), each checked after its edits` };
}

const CHECKS = { review: checkParallel, dispatch: checkParallel, execute: checkExecute };

function checkTrace(raw) {
  // Async hooks can append out of order; sort is stable for equal times.
  const lines = [...raw].sort((a, b) => a.t - b.t);
  const calls = toCalls(lines);
  return toRuns(lines, calls)
    .filter((r) => CHECKS[r.skill])
    .map((r) => ({ skill: r.skill, t: r.t, ...CHECKS[r.skill](r) }));
}

function newestTrace(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function main(argv) {
  const dir = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'trace');
  const file = argv[0] || newestTrace(dir);
  if (!file || !fs.existsSync(file)) {
    console.log(`No trace found in ${dir}. Turn on the skillTrace hook bundle, run a skill, then check again.`);
    return 0;
  }
  const results = checkTrace(readTrace(file));
  console.log(`Trace: ${file}`);
  if (!results.length) console.log('No review, dispatch or execute runs in this trace.');
  for (const r of results) {
    const time = new Date(r.t).toISOString().slice(11, 19);
    console.log(`${r.status.padEnd(4)} ${r.skill} (${time} UTC): ${r.why}`);
  }
  return results.some((r) => r.status === 'FAIL') ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { checkTrace, toCalls, toRuns, waves };
