'use strict';

// Runner for skill-trace (the hook) and skills/flow-check (the checker).
//   node hooks/tests/skill-trace.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('./harness');
const { checkTrace } = require('../../skills/flow-check/flow-check');

const t = h.makeAsserter('skill-trace');

// --- hook: writes the trace into the project -------------------------------
{
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-trace-proj-'));
  const home = h.makeTempHome('skill-trace-home-');
  process.env.CLAUDE_PROJECT_DIR = project;
  const run = (p) => h.runHook('skill-trace', JSON.stringify({ session_id: 's/1', ...p }), { home });

  const r1 = run({ hook_event_name: 'UserPromptSubmit', prompt: '/contexture:review --pr 3 secret words' });
  run({ hook_event_name: 'UserPromptSubmit', prompt: 'plain prompt' });
  run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'a1', tool_input: { subagent_type: 'security-reviewer', prompt: 'x' } });
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'b1', tool_input: { command: 'npm test ' + 'x'.repeat(500) } });
  run({ hook_event_name: 'PreToolUse', tool_name: 'mcp__project-memory__write_memory', tool_use_id: 'm1', tool_input: { tier: 'scratch', body: 'b' } });
  run({ hook_event_name: 'Stop' });

  const dir = path.join(project, '.claude', 'trace');
  const file = path.join(dir, 's_1.jsonl');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  t.assert('hook exits 0 and prints nothing', r1.exit === 0 && r1.stdout === '', JSON.stringify(r1));
  t.assert('trace folder ignores itself', fs.existsSync(path.join(dir, '.gitignore')) && fs.readFileSync(path.join(dir, '.gitignore'), 'utf8') === '*\n');
  t.assert('session id is made safe for a file name', fs.existsSync(file));
  t.assert('4 lines: typed skill, agent, bash, memory (plain prompt and Stop skipped)', lines.length === 4, JSON.stringify(lines));
  t.assert('typed skill keeps the name only', lines[0] && lines[0].skill === 'contexture:review' && !JSON.stringify(lines[0]).includes('secret'), JSON.stringify(lines[0]));
  t.assert('agent type recorded, prompt not', lines[1] && lines[1].sub === 'security-reviewer' && lines[1].prompt === undefined, JSON.stringify(lines[1]));
  t.assert('bash command cut to 200 chars', lines[2] && lines[2].cmd.length === 200);
  t.assert('memory tier recorded', lines[3] && lines[3].tier === 'scratch');

  const old = path.join(dir, 'old.jsonl');
  fs.writeFileSync(old, '{}\n');
  const past = (Date.now() - 20 * 86400000) / 1000;
  fs.utimesSync(old, past, past);
  run({ session_id: 's2', hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {} });
  t.assert('new session removes traces older than 14 days', !fs.existsSync(old));

  const bad = h.runHook('skill-trace', 'not json', { home });
  t.assert('bad payload fails open', bad.exit === 0);
}

// --- checker -----------------------------------------------------------------
let clock = 0;
const at = () => (clock += 10);
const typed = (skill) => ({ t: at(), ev: 'prompt', skill });
const skill = (name) => ({ t: at(), ev: 'pre', tool: 'Skill', id: 'sk' + clock, skill: name });
const pre = (id, tool, extra = {}) => ({ t: at(), ev: 'pre', tool, id, ...extra });
const post = (id, tool) => ({ t: at(), ev: 'post', tool, id });
const call = (id, tool, extra) => [pre(id, tool, extra), post(id, tool)];
const mark = (id) => call(id, 'mcp__project-memory__write_memory', { tier: 'scratch' });

{
  const lines = [typed('contexture:review'), pre('a1', 'Agent'), pre('a2', 'Agent'), pre('a3', 'Agent'), post('a2', 'Agent'), post('a1', 'Agent'), post('a3', 'Agent'), ...call('v1', 'Agent')];
  const [r] = checkTrace(lines);
  t.assert('review: agents together then a lone verifier passes', r && r.status === 'PASS' && r.why.includes('3,1'), JSON.stringify(r));
}
{
  const lines = [skill('review'), ...call('a1', 'Agent'), ...call('a2', 'Agent'), ...call('a3', 'Agent')];
  const [r] = checkTrace(lines);
  t.assert('review: agents one at a time fails', r && r.status === 'FAIL' && r.why.includes('1,1,1'), JSON.stringify(r));
}
{
  const lines = [typed('pr-review'), skill('contexture:review'), ...call('a1', 'Agent'), ...call('a2', 'Agent')];
  const res = checkTrace(lines);
  t.assert('typed /pr-review then its Skill call is one review run', res.length === 1 && res[0].skill === 'review' && res[0].status === 'FAIL', JSON.stringify(res));
}
{
  const lines = [skill('review'), pre('x1', 'Agent', { agent: 'sub1' }), pre('x2', 'Agent', { agent: 'sub1' }), ...call('a1', 'Agent')];
  const [r] = checkTrace(lines);
  t.assert('review: agents started by a subagent are not counted', r && r.status === 'SKIP', JSON.stringify(r));
}
{
  const lines = [
    typed('execute'),
    ...call('e1', 'Edit'), ...call('b1', 'Bash'), ...mark('m1'),
    ...call('s1', 'Skill', { skill: 'test-driven-development' }),
    ...call('e2', 'Write'), ...call('r1', 'Read'), ...mark('m2'),
  ];
  const [r] = checkTrace(lines);
  t.assert('execute: each step checked passes; a nested skill does not end the run', r && r.status === 'PASS' && r.why.startsWith('2 step'), JSON.stringify(r));
}
{
  const lines = [typed('execute'), ...call('b1', 'Bash'), ...call('e1', 'Edit'), ...mark('m1')];
  const [r] = checkTrace(lines);
  t.assert('execute: edit with no check before the record fails', r && r.status === 'FAIL' && r.why.includes('step 1'), JSON.stringify(r));
}
{
  const lines = [typed('execute'), ...call('e1', 'Edit'), ...call('b1', 'Bash'), ...mark('m1'), ...call('e2', 'Edit')];
  const [r] = checkTrace(lines);
  t.assert('execute: unchecked edits after the last record are a note', r && r.status === 'NOTE', JSON.stringify(r));
}
{
  const lines = [typed('execute'), ...call('e1', 'Edit'), ...call('b1', 'Bash')];
  const [r] = checkTrace(lines);
  t.assert('execute: no scratch records is a skip, not a fail', r && r.status === 'SKIP' && r.why.includes('project-memory'), JSON.stringify(r));
}
{
  const lines = [typed('brainstorm'), ...call('a1', 'Agent'), ...call('a2', 'Agent')];
  t.assert('skills without a check are not reported', checkTrace(lines).length === 0);
}

// --- CLI ---------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const cli = path.join(h.HOOKS_DIR, '..', 'skills', 'flow-check', 'flow-check.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-trace-cli-'));
  const file = path.join(dir, 'x.jsonl');
  fs.writeFileSync(file, [skill('review'), ...call('a1', 'Agent'), ...call('a2', 'Agent')].map((l) => JSON.stringify(l)).join('\r\n') + '\r\n');
  const r = spawnSync('node', [cli, file], { encoding: 'utf8' });
  t.assert('CLI reads a CRLF trace, prints FAIL and exits 1', r.status === 1 && /FAIL review/.test(r.stdout), r.stdout + r.stderr);
  const empty = spawnSync('node', [cli], { encoding: 'utf8', cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
  t.assert('CLI with no trace says how to turn it on and exits 0', empty.status === 0 && /skillTrace/.test(empty.stdout), empty.stdout);
}

t.report();
