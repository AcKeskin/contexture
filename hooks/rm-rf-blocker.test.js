'use strict';

// Regression fixtures for rm-rf-blocker: each case pipes a Bash tool payload
// through the hook and asserts the exit code (0 = allow, 2 = block).
// Plain-node test, matching the repo convention (hooks/lib/glob-files.test.js):
// run with `node hooks/rm-rf-blocker.test.js`.

const { spawnSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, 'rm-rf-blocker.js');
const IS_WIN = process.platform === 'win32';
// The root need not exist — the hook compares path strings only.
const ROOT = IS_WIN ? 'C:\\fixture\\proj' : '/fixture/proj';

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

function runRaw(stdin) {
  const r = spawnSync('node', [HOOK], {
    input: stdin,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: ROOT }),
  });
  return r.status;
}

function runCmd(command) {
  return runRaw(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
}

const BLOCK = 2;
const ALLOW = 0;

const cases = [
  // Direct dangerous targets.
  ['rm -rf /', BLOCK],
  ['rm -rf ~', BLOCK],
  ['rm -rf ~/', BLOCK],
  ['rm -rf $HOME', BLOCK],
  ['rm -rf $HOME/', BLOCK],
  ['rm -rf .', BLOCK],
  ['rm -rf ..', BLOCK],
  // rm hidden behind chain/pipe operators and newlines.
  ['echo hi && rm -rf ~', BLOCK],
  ['cd x && rm -rf ~', BLOCK],
  ['true; rm -rf /', BLOCK],
  ['git pull | rm -rf /', BLOCK],
  ['echo a || rm -rf /', BLOCK],
  ['ls\nrm -rf /', BLOCK],
  ['cd sub && rm -rf .', BLOCK],
  // rm inside command substitution and embedded shell strings.
  ['echo $(rm -rf /)', BLOCK],
  ['echo `rm -rf ~`', BLOCK],
  ['sh -c "rm -rf /"', BLOCK],
  // Deliberate false-block: quotes are not respected, prose containing a
  // dangerous rm -rf blocks too (safety over precision).
  ['echo "delete with rm -rf / later"', BLOCK],
  // Project root and its ancestors.
  [`rm -rf ${ROOT}`, BLOCK],
  [`rm -rf ${path.dirname(ROOT)}`, BLOCK],
  // Routine deletes stay allowed.
  ['rm -rf ./node_modules', ALLOW],
  [`rm -rf ${ROOT}${IS_WIN ? '\\' : '/'}node_modules`, ALLOW],
  ['rm file.txt', ALLOW],
  ['git rm file.txt', ALLOW],
  ['echo hi && rm -rf ./build', ALLOW],
  ['find . -name "*.tmp" -exec rm -rf {} \\;', ALLOW],
  // No rm invocation at all — the word-boundary prefilter must not misfire.
  ['npm run format', ALLOW],
  ['ls /frm/', ALLOW],
  ['git commit -m "remove rm -rf usage"', ALLOW],
  ['git log --format="%h|%s"', ALLOW],
];

if (IS_WIN) {
  cases.push(
    // NTFS is case-insensitive; MSYS and backslash spellings are the same path.
    ['rm -rf c:/FIXTURE/proj', BLOCK],
    ['rm -rf /c/fixture/proj', BLOCK],
    ['rm -rf C:\\fixture\\proj', BLOCK],
    ['rm -rf /c/fixture/proj/sub', ALLOW]
  );
}

for (const [cmd, expected] of cases) {
  const got = runCmd(cmd);
  check(
    `${expected === BLOCK ? 'block' : 'allow'}: ${JSON.stringify(cmd)}`,
    got === expected,
    `exit ${got}, expected ${expected}`
  );
}

// Fail-open contract.
check('non-Bash tool allows', runRaw(JSON.stringify({ tool_name: 'Write', tool_input: {} })) === ALLOW);
check('malformed payload allows', runRaw('not json{') === ALLOW);
check('empty stdin allows', runRaw('') === ALLOW);

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
