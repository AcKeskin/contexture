'use strict';

// Runner for command-facts. Each case gets a temp home and a temp project.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('./harness');

const t = h.makeAsserter('command-facts');

function run(home, project, payload) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  delete env.CLAUDE_SESSION_ID;
  const r = spawnSync('node', [path.join(h.HOOKS_DIR, 'command-facts.js')], { input: JSON.stringify(payload), encoding: 'utf8', env });
  return { exit: r.status, stdout: r.stdout || '' };
}

const fail = (sid, command, error) => ({ session_id: sid, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, error });
const ok = (sid, command) => ({ session_id: sid, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: '' } });
const start = (sid) => ({ session_id: sid, hook_event_name: 'SessionStart', source: 'startup' });

function setup() {
  return { home: h.makeTempHome('cmd-facts-'), project: fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-proj-')) };
}

function ledger(home) {
  try {
    return JSON.parse(fs.readFileSync(path.join(home, '.claude', 'command-facts.json'), 'utf8'));
  } catch {
    return {};
  }
}

function repair(home, project, sid) {
  run(home, project, fail(sid, 'pytest tests/ -q', 'Exit code 127\n/bin/sh: 1: pytest: not found'));
  run(home, project, ok(sid, 'cd backend && python -m pytest tests/ -q'));
}

// Three sessions confirm the repair, then the next start offers it once.
{
  const { home, project } = setup();
  repair(home, project, 's1');
  repair(home, project, 's1'); // same session twice counts once
  let r = run(home, project, start('s2'));
  t.assert('one session: nothing offered yet', r.stdout.trim() === '', r.stdout);

  repair(home, project, 's2');
  repair(home, project, 's3');
  const facts = Object.values(ledger(home))[0] || {};
  const f = facts['pytest -> python -m pytest'];
  t.assert('fact recorded with the working form', f && f.works === 'python -m pytest', JSON.stringify(facts));
  t.assert('three distinct sessions', f && f.sessions.length === 3, JSON.stringify(f));

  r = run(home, project, start('s4'));
  const ctx = h.additionalContext(r.stdout, 'SessionStart') || '';
  t.assert('start: offers the fact', ctx.includes('`python -m pytest` works') && ctx.includes('/capture'), r.stdout);
  t.assert('start: says not to write it', ctx.includes('Do not write the memory yourself'), ctx);

  r = run(home, project, start('s5'));
  t.assert('start: offered only once', r.stdout.trim() === '', r.stdout);
}

// Windows wording and npx.
{
  const { home, project } = setup();
  for (const sid of ['a', 'b', 'c']) {
    run(home, project, fail(sid, 'tsc --noEmit', "'tsc' is not recognized as an internal or external command,"));
    run(home, project, ok(sid, 'npx tsc --noEmit'));
  }
  const facts = Object.values(ledger(home))[0] || {};
  t.assert('windows not recognized: tsc -> npx tsc', !!facts['tsc -> npx tsc'], JSON.stringify(facts));
}

// A test failure is not an environment error.
{
  const { home, project } = setup();
  run(home, project, fail('s1', 'pytest', 'Exit code 1\nFAILED tests/test_a.py::test_x - AssertionError'));
  run(home, project, ok('s1', 'python -m pytest'));
  t.assert('test failure: no fact', Object.keys(ledger(home)).length === 0, JSON.stringify(ledger(home)));
}

// Not another spelling: an install, a lookup, a missing dependency.
{
  const { home, project } = setup();
  run(home, project, fail('s1', 'pytest -q', 'pytest: command not found'));
  run(home, project, ok('s1', 'pip install pytest && pytest -q'));
  run(home, project, fail('s1', 'tsc', 'tsc: not found'));
  run(home, project, ok('s1', 'which tsc'));
  run(home, project, fail('s1', 'python app.py', "ModuleNotFoundError: No module named 'requests'"));
  run(home, project, ok('s1', 'pip install requests'));
  t.assert('install / which / dependency: no fact', Object.keys(ledger(home)).length === 0, JSON.stringify(ledger(home)));
}

// Success too late does not pair.
{
  const { home, project } = setup();
  run(home, project, fail('s1', 'pytest', 'pytest: command not found'));
  for (let i = 0; i < 6; i++) run(home, project, ok('s1', 'ls'));
  run(home, project, ok('s1', 'python -m pytest'));
  t.assert('outside the window: no fact', Object.keys(ledger(home)).length === 0, JSON.stringify(ledger(home)));
}

// The failing spelling working later retires the fact.
{
  const { home, project } = setup();
  repair(home, project, 's1');
  repair(home, project, 's2');
  run(home, project, ok('s3', 'pytest -q'));
  t.assert('plain form works: fact retired', Object.keys(ledger(home)).length === 0, JSON.stringify(ledger(home)));
}

// Facts are per project.
{
  const { home, project } = setup();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-proj-'));
  for (const sid of ['s1', 's2', 's3']) repair(home, project, sid);
  const r = run(home, other, start('s4'));
  t.assert('other project: nothing offered', r.stdout.trim() === '', r.stdout);
}

// Garbage in: fails open.
{
  const { home, project } = setup();
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  const r = spawnSync('node', [path.join(h.HOOKS_DIR, 'command-facts.js')], { input: '{bad', encoding: 'utf8', env });
  t.assert('bad payload: exit 0, silent', r.status === 0 && (r.stdout || '').trim() === '', r.stdout);
}

t.report();
