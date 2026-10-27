'use strict';

// Runner for file-history-precheck, compact-snapshot, edit-checks and
// codemap-search-nudge. Each case gets a temp home and a temp project.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('./harness');

const t = h.makeAsserter('context-hooks');

function run(hook, payload, home, project) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  delete env.CLAUDE_SESSION_ID;
  const r = spawnSync('node', [path.join(h.HOOKS_DIR, hook + '.js')], { input: JSON.stringify(payload), encoding: 'utf8', env });
  return { exit: r.status, stdout: r.stdout || '' };
}

function setup() {
  const home = h.makeTempHome('ctx-hooks-');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-proj-'));
  return { home, project };
}

function memoryDir(home, project) {
  const slug = project.replace(/[^A-Za-z0-9]/g, '-');
  const dir = path.join(home, '.claude', 'projects', slug, 'memory');
  fs.mkdirSync(path.join(dir, 'warnings'), { recursive: true });
  return dir;
}

// file-history-precheck
{
  const { home, project } = setup();
  const mem = memoryDir(home, project);
  fs.writeFileSync(
    path.join(mem, 'warnings', 'cache-reset.md'),
    '---\nname: cache-reset-breaks-login\ndescription: Resetting the cache in session-store.ts logged everyone out\nkind: warning\n---\nDo not call reset() in src/session-store.ts on boot.\n'
  );
  fs.writeFileSync(path.join(mem, 'pref.md'), '---\nname: pref\nkind: preference\n---\nsrc/session-store.ts style.\n');
  const edit = (file, session = 's1') => ({
    session_id: session,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: path.join(project, file) },
  });

  let r = run('file-history-precheck', edit('src/session-store.ts'), home, project);
  const ctx = h.additionalContext(r.stdout, 'PreToolUse');
  t.assert('file-history: warning naming the file is shown', ctx && ctx.includes('cache-reset-breaks-login'), r.stdout);
  t.assert('file-history: non-warning memory is not shown', ctx && !ctx.includes('pref'), r.stdout);

  r = run('file-history-precheck', edit('src/session-store.ts'), home, project);
  t.assert('file-history: second edit in the same session is silent', r.stdout.trim() === '', r.stdout);

  r = run('file-history-precheck', edit('src/other.ts', 's2'), home, project);
  t.assert('file-history: unrelated file is silent', r.stdout.trim() === '', r.stdout);

  r = run('file-history-precheck', edit('lib/index.ts', 's3'), home, project);
  t.assert('file-history: exits 0', r.exit === 0);
}

// compact-snapshot
{
  const { home, project } = setup();
  const transcript = path.join(project, 't.jsonl');
  const lines = [
    { message: { role: 'user', content: [{ type: 'text', text: 'Fix the login redirect bug' }] } },
    { message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/src/login.ts' } }] } },
    { message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: 'npm test failed: 2 failing' }] } },
    { message: { role: 'assistant', content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos: [
      { content: 'Add redirect test', status: 'in_progress' },
      { content: 'Read the bug report', status: 'completed' },
    ] } }] } },
    { message: { role: 'user', content: '<system-reminder>ignore me</system-reminder>' } },
    { message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'tc1', name: 'TaskCreate', input: { subject: 'Ship the fix' } },
      { type: 'tool_use', id: 'tc2', name: 'TaskCreate', input: { subject: 'Old task' } },
    ] } },
    { message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tc1', content: 'Task #1 created successfully: Ship the fix' },
      { type: 'tool_result', tool_use_id: 'tc2', content: 'Task #2 created successfully: Old task' },
    ] } },
    { message: { role: 'assistant', content: [{ type: 'tool_use', name: 'TaskUpdate', input: { taskId: '2', status: 'completed' } }] } },
    { isMeta: true, message: { role: 'user', content: 'Caveat: local command output below' } },
  ];
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

  let r = run('compact-snapshot', { session_id: 'c1', hook_event_name: 'PreCompact', trigger: 'auto', transcript_path: transcript }, home, project);
  t.assert('compact: PreCompact is silent', r.exit === 0 && r.stdout.trim() === '', r.stdout);

  r = run('compact-snapshot', { session_id: 'c1', hook_event_name: 'SessionStart', source: 'compact' }, home, project);
  const ctx = h.additionalContext(r.stdout, 'SessionStart') || '';
  t.assert('compact: restores last real request', ctx.includes('Fix the login redirect bug') && !ctx.includes('ignore me'), ctx);
  t.assert('compact: restores open todos only', ctx.includes('Add redirect test') && !ctx.includes('Read the bug report'), ctx);
  t.assert('compact: restores open tasks from TaskCreate', ctx.includes('[pending] Ship the fix') && !ctx.includes('Old task'), ctx);
  t.assert('compact: skips meta lines as the request', !ctx.includes('Caveat'), ctx);
  t.assert('compact: restores edited files and errors', ctx.includes('/p/src/login.ts') && ctx.includes('2 failing'), ctx);
  t.assert('compact: snapshot is capped', ctx.length <= 2000, String(ctx.length));

  r = run('compact-snapshot', { session_id: 'c1', hook_event_name: 'SessionStart', source: 'compact' }, home, project);
  t.assert('compact: snapshot is used once', r.stdout.trim() === '', r.stdout);

  r = run('compact-snapshot', { session_id: 'c2', hook_event_name: 'PreCompact', transcript_path: '/nope.jsonl' }, home, project);
  t.assert('compact: missing transcript fails open', r.exit === 0 && r.stdout.trim() === '', r.stdout);
}

// edit-checks
{
  const { home, project } = setup();
  fs.mkdirSync(path.join(project, '.claude'));
  // The "linter" prints every line containing TODO, with its line number.
  const lint = path.join(project, 'lint.js');
  fs.writeFileSync(
    lint,
    "const fs=require('fs');const f=process.argv[2];fs.readFileSync(f,'utf8').split('\\n').forEach((l,i)=>{if(l.includes('TODO'))console.log(f+':'+(i+1)+': '+l.trim())});"
  );
  fs.writeFileSync(
    path.join(project, '.claude', 'edit-checks.json'),
    JSON.stringify({ checks: [{ glob: '*.txt', command: `node ${JSON.stringify(lint)} {file}` }] })
  );
  const file = path.join(project, 'a.txt');
  fs.writeFileSync(file, 'TODO old\n');
  const payload = (event) => ({ session_id: 'e1', hook_event_name: event, tool_name: 'Edit', tool_input: { file_path: file } });

  let r = run('edit-checks', { ...payload('PreToolUse'), session_id: 'e0' }, home, project);
  const notice = h.additionalContext(r.stdout, 'PreToolUse') || '';
  t.assert('edit-checks: untrusted config is named, not run', notice.includes('not trusted') && notice.includes('--trust'), r.stdout);
  r = run('edit-checks', { ...payload('PreToolUse'), session_id: 'e0' }, home, project);
  t.assert('edit-checks: untrusted notice once per session', r.stdout.trim() === '', r.stdout);

  const trustRun = (cwdProject) =>
    spawnSync('node', [path.join(h.HOOKS_DIR, 'edit-checks.js'), '--trust', cwdProject], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
  trustRun(project);

  r = run('edit-checks', payload('PreToolUse'), home, project);
  t.assert('edit-checks: baseline run is silent', r.exit === 0 && r.stdout.trim() === '', r.stdout);

  fs.writeFileSync(file, 'new first line\nTODO old\nTODO new\n');
  r = run('edit-checks', payload('PostToolUse'), home, project);
  const ctx = h.additionalContext(r.stdout, 'PostToolUse') || '';
  t.assert('edit-checks: reports the new finding', ctx.includes('TODO new'), r.stdout);
  t.assert('edit-checks: drops the shifted old finding', !ctx.includes('TODO old'), ctx);

  r = run('edit-checks', payload('PostToolUse'), home, project);
  t.assert('edit-checks: a finding is reported once', r.stdout.trim() === '', r.stdout);

  r = run('edit-checks', { ...payload('PostToolUse'), session_id: 'e2' }, home, project);
  t.assert('edit-checks: no baseline means silent baseline', r.stdout.trim() === '', r.stdout);

  fs.appendFileSync(path.join(project, '.claude', 'edit-checks.json'), '\n');
  r = run('edit-checks', { ...payload('PreToolUse'), session_id: 'e3' }, home, project);
  t.assert('edit-checks: a changed config needs trust again', (h.additionalContext(r.stdout, 'PreToolUse') || '').includes('not trusted'), r.stdout);

  r = run('edit-checks', { ...payload('PostToolUse'), tool_input: { file_path: path.join(project, 'b.md') } }, home, project);
  t.assert('edit-checks: unmatched file is silent', r.stdout.trim() === '', r.stdout);
}

// codemap-search-nudge
{
  const { home, project } = setup();
  const grep = (session) => ({ session_id: session, hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { pattern: 'x' } });

  let r = run('codemap-search-nudge', grep('n1'), home, project);
  t.assert('nudge: silent without a codemap', r.stdout.trim() === '', r.stdout);

  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'codemap.md'), '# codemap\n');
  r = run('codemap-search-nudge', grep('n2'), home, project);
  t.assert('nudge: points at the codemap', (h.additionalContext(r.stdout, 'PreToolUse') || '').includes('.claude/codemap.md'), r.stdout);

  r = run('codemap-search-nudge', grep('n2'), home, project);
  t.assert('nudge: once per session', r.stdout.trim() === '', r.stdout);
}

// codemap-refresh
{
  const { home, project } = setup();
  const git = (...a) => spawnSync('git', a, { cwd: project, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(project, '.claude'));
  const codemap = path.join(project, '.claude', 'codemap.md');
  fs.writeFileSync(codemap, '# old codemap\n');
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(codemap, old, old);
  const start = { session_id: 'r1', hook_event_name: 'SessionStart', source: 'startup' };

  fs.writeFileSync(path.join(project, 'one.ts'), 'export const a = 1;\n');
  let r = run('codemap-refresh', start, home, project);
  t.assert('refresh: one changed file stays quiet', r.exit === 0 && r.stdout.trim() === '', r.stdout);

  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(project, `f${i}.ts`), `export const v${i} = ${i};\n`);
  r = run('codemap-refresh', start, home, project);
  const ctx = h.additionalContext(r.stdout, 'SessionStart') || '';
  t.assert('refresh: six changed files are reported', ctx.includes('6 file(s) changed') && ctx.includes('/update-codemap'), r.stdout);

  // Work committed after a regen it was part of does not count.
  const regen = new Date(Date.now() + 1000);
  fs.utimesSync(codemap, regen, regen);
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'work');
  t.assert('refresh: commit after regen is not counted', require('../lib/codemap-state').codemapStaleness(project).changed === 0);
  fs.utimesSync(codemap, old, old);

  // A project in a subfolder only counts its own files.
  const sub = path.join(project, 'sub');
  fs.mkdirSync(path.join(sub, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(sub, '.claude', 'codemap.md'), '# sub codemap\n');
  fs.utimesSync(path.join(sub, '.claude', 'codemap.md'), old, old);
  fs.writeFileSync(path.join(sub, 'x.ts'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(project, 'outside.ts'), 'export const o = 1;\n');
  t.assert('refresh: subfolder project counts only its files', require('../lib/codemap-state').codemapStaleness(sub).changed === 1);
  fs.rmSync(sub, { recursive: true, force: true });
  fs.rmSync(path.join(project, 'outside.ts'));

  r = run('codemap-refresh', { session_id: 'r1', hook_event_name: 'Stop' }, home, project);
  t.assert('refresh: Stop without opt-in does nothing', r.stdout.trim() === '' && fs.readFileSync(codemap, 'utf8') === '# old codemap\n', r.stdout);

  fs.writeFileSync(path.join(project, '.claude', 'codemap.config.md'), '# Codemap config\n\n## Auto-update\n\n- refresh: true\n');
  const engineDeps = path.join(h.HOOKS_DIR, '..', 'skills', 'update-codemap', 'node_modules', 'web-tree-sitter');
  r = run('codemap-refresh', start, home, project);
  if (fs.existsSync(engineDeps)) {
    let fresh = false;
    for (let i = 0; i < 100 && !fresh; i++) {
      spawnSync('sleep', ['0.2']);
      fresh = fs.readFileSync(codemap, 'utf8') !== '# old codemap\n' && !fs.existsSync(path.join(project, '.claude', 'codemap.refresh.lock'));
    }
    t.assert('refresh: opted-in project is regenerated in the background', fresh, fs.readFileSync(codemap, 'utf8').slice(0, 80));
  } else {
    t.assert('refresh: opted-in without deps advises instead', (h.additionalContext(r.stdout, 'SessionStart') || '').includes('npm install'), r.stdout);
  }

  r = run('codemap-search-nudge', { session_id: 'r9', hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: {} }, home, project);
  t.assert('nudge: names the Symbol index', (h.additionalContext(r.stdout, 'PreToolUse') || '').includes('## Symbol index'), r.stdout);
}

t.report();
