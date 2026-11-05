'use strict';

// Runner for loop-guard. Each case gets a temp home; state lives in
// ~/.claude/hook-state/loop-guard-<session>.json.

const h = require('./harness');

const t = h.makeAsserter('loop-guard');

function run(home, payload) {
  return h.runHook('loop-guard', JSON.stringify({ session_id: 's1', ...payload }), { home });
}

const prompt = { hook_event_name: 'UserPromptSubmit', prompt: 'fix the test' };
const edit = (file) => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file } });
const bash = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } };
const fail = (msg) => ({
  hook_event_name: 'PostToolUseFailure',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  error: 'Exit code 1\n' + msg,
});

// One loop round: edit the same file, run the test, same failure.
function round(home, i, msg = 'AssertionError: expected 3 to equal 4 at test/sum.test.js:12') {
  const outs = [];
  outs.push(run(home, edit('/p/src/sum.js')));
  outs.push(run(home, fail(msg.replace('12', String(10 + i)))));
  outs.push(run(home, bash));
  return outs.map((r) => h.additionalContext(r.stdout, null)).filter(Boolean);
}

// Repeating the same failure while editing one file: one redirect, then later a notice.
{
  const home = h.makeTempHome('loop-guard-');
  run(home, prompt);
  const said = [];
  for (let i = 0; i < 7; i++) said.push(...round(home, i));
  t.assert('stuck turn: one redirect within 21 calls', said.length === 1 && said[0].includes('Do not stop'), JSON.stringify(said));
  t.assert('redirect names the busiest file', said[0] && said[0].includes('/p/src/sum.js'), said[0]);

  const later = [];
  for (let i = 0; i < 7; i++) later.push(...round(home, i));
  t.assert('still stuck: one notice for the user', later.length === 1 && later[0].includes('Esc'), JSON.stringify(later));

  const after = [];
  for (let i = 0; i < 7; i++) after.push(...round(home, i));
  t.assert('after the notice: silent for the rest of the turn', after.length === 0, JSON.stringify(after));

  run(home, prompt);
  const next = [];
  for (let i = 0; i < 7; i++) next.push(...round(home, i));
  t.assert('new prompt resets: redirect can fire again', next.length === 1 && next[0].includes('Do not stop'), JSON.stringify(next));
}

// Busy but moving: every failure is different, so no redirect.
{
  const home = h.makeTempHome('loop-guard-');
  run(home, prompt);
  const said = [];
  const errors = ['TypeError: a is undefined', 'SyntaxError: Unexpected token', 'ReferenceError: foo', 'Cannot find module bar', 'ENOENT: config.json', 'timeout in fetch', 'assert ok failed', 'port in use'];
  for (let i = 0; i < 8; i++) said.push(...round(home, i, errors[i]));
  t.assert('changing failures: no redirect', said.length === 0, JSON.stringify(said));
}

// Repeated failures with no edits: no churn, no redirect.
{
  const home = h.makeTempHome('loop-guard-');
  run(home, prompt);
  const said = [];
  for (let i = 0; i < 12; i++) {
    for (const p of [fail('connect ECONNREFUSED 127.0.0.1:5432'), bash]) {
      const r = run(home, p);
      const c = h.additionalContext(r.stdout, null);
      if (c) said.push(c);
    }
  }
  t.assert('no edits: no redirect', said.length === 0, JSON.stringify(said));
}

// Interrupts don't count as failures.
{
  const home = h.makeTempHome('loop-guard-');
  run(home, prompt);
  const said = [];
  for (let i = 0; i < 8; i++) {
    for (const p of [edit('/p/a.js'), { ...fail('aborted'), is_interrupt: true }, bash]) {
      const r = run(home, p);
      const c = h.additionalContext(r.stdout, null);
      if (c) said.push(c);
    }
  }
  t.assert('interrupts: no redirect', said.length === 0, JSON.stringify(said));
}

// Thresholds from hook-config.json.
{
  const home = h.makeTempHome('loop-guard-');
  h.writeHookConfig(home, { loopGuard: { minCalls: 6, failures: 2, editChurn: 3 } });
  run(home, prompt);
  const said = [];
  for (let i = 0; i < 3; i++) said.push(...round(home, i));
  t.assert('config: lower thresholds fire sooner', said.length === 1, JSON.stringify(said));
}

// Garbage in: fails open.
{
  const home = h.makeTempHome('loop-guard-');
  const r = h.runHook('loop-guard', 'not json', { home });
  t.assert('bad payload: exit 0, silent', r.exit === 0 && r.stdout.trim() === '', r.stdout + r.stderr);
}

t.report();
