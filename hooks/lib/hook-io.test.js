'use strict';

// Payload adapters in hook-io: Gemini and Cursor payloads must reach the hooks
// as Claude payloads, and Cursor must get its deny as JSON on stdout.
// Run with `node hooks/lib/hook-io.test.js`.

const { spawnSync } = require('child_process');
const path = require('path');

const HOOKS = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`PASS: ${name}`);
    pass++;
  } else {
    console.log(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

function run(hook, payload, env = {}) {
  const r = spawnSync('node', [path.join(HOOKS, hook)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: '' }, env),
  });
  return { exit: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Gemini: exit 2 blocks, like Claude.
let r = run('rm-rf-blocker.js', {
  hook_event_name: 'BeforeTool',
  tool_name: 'run_shell_command',
  tool_input: { command: 'rm -rf /' },
});
check('gemini: rm -rf / blocks', r.exit === 2, `exit ${r.exit}`);

// Cursor: deny is JSON on stdout with exit 0.
r = run('rm-rf-blocker.js', {
  hook_event_name: 'beforeShellExecution',
  command: 'rm -rf /',
  workspace_roots: ['/fixture/proj'],
});
let out = {};
try {
  out = JSON.parse(r.stdout);
} catch {}
check('cursor: rm -rf / denies', r.exit === 0 && out.permission === 'deny', `exit ${r.exit}, stdout ${r.stdout}`);

r = run('rm-rf-blocker.js', {
  hook_event_name: 'beforeShellExecution',
  command: 'rm -rf build',
  workspace_roots: ['/fixture/proj'],
});
check('cursor: rm -rf in project allows silently', r.exit === 0 && r.stdout === '', `exit ${r.exit}, stdout ${r.stdout}`);

// Cursor: workspace_roots[0] is the project root.
r = run('rm-rf-blocker.js', {
  hook_event_name: 'beforeShellExecution',
  command: 'rm -rf /fixture/proj',
  workspace_roots: ['/fixture/proj'],
});
check('cursor: rm -rf on the workspace root denies', r.stdout.includes('"deny"'), `stdout ${r.stdout}`);

r = run('force-push-main-blocker.js', {
  hook_event_name: 'beforeShellExecution',
  command: 'git push --force origin main',
  workspace_roots: ['/fixture/proj'],
});
check('cursor: force push to main denies', r.stdout.includes('"deny"'), `stdout ${r.stdout}`);

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
