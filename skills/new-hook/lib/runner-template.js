'use strict';

// Generates a Node-based runner script for a scaffolded hook.
// The runner spawns the hook twice (block + allow fixtures), captures exit
// code and stdout, and asserts based on the recipe mode.
//
// mode: 'blocker' — assert block fixture exits 2, allow fixture exits 0.
// mode: 'context-injector' — assert matching event exits 0 with non-empty
//   JSON stdout containing a non-empty `context` field; non-matching event
//   exits 0 with empty stdout.

function generateRunner({ hookPath, fixturesDir, hookName, mode = 'blocker' }) {
  const hookForward = forwardSlash(hookPath);
  const fixturesForward = forwardSlash(fixturesDir);
  return [
    `'use strict';`,
    ``,
    `// Auto-generated runner for hook '${hookName}'. Mode: ${mode}.`,
    `// Spawns the hook twice and asserts the recipe contract.`,
    ``,
    `const { spawnSync } = require('child_process');`,
    `const fs = require('fs');`,
    `const path = require('path');`,
    ``,
    `const HOOK = ${JSON.stringify(hookForward)};`,
    `const FIXTURES = ${JSON.stringify(fixturesForward)};`,
    `const MODE = ${JSON.stringify(mode)};`,
    ``,
    `let pass = 0;`,
    `let fail = 0;`,
    ``,
    `function run(payloadFile) {`,
    `  const payload = fs.readFileSync(path.join(FIXTURES, payloadFile), 'utf8');`,
    `  const r = spawnSync('node', [HOOK], { input: payload, encoding: 'utf8' });`,
    `  return { exit: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };`,
    `}`,
    ``,
    `function assert(name, cond, detail) {`,
    `  if (cond) { console.log('PASS: ' + name); pass++; }`,
    `  else { console.log('FAIL: ' + name + (detail ? ' — ' + detail : '')); fail++; }`,
    `}`,
    ``,
    `if (MODE === 'blocker') {`,
    `  const blockResult = run(${JSON.stringify(`${hookName}.block.json`)});`,
    `  assert('block fixture exits 2', blockResult.exit === 2, 'got exit ' + blockResult.exit);`,
    ``,
    `  const allowResult = run(${JSON.stringify(`${hookName}.allow.json`)});`,
    `  assert('allow fixture exits 0', allowResult.exit === 0, 'got exit ' + allowResult.exit);`,
    `} else if (MODE === 'context-injector') {`,
    `  const matchResult = run(${JSON.stringify(`${hookName}.block.json`)});`,
    `  assert('matching event exits 0', matchResult.exit === 0, 'got exit ' + matchResult.exit);`,
    `  assert('matching event has stdout', matchResult.stdout.trim().length > 0, 'stdout was empty');`,
    `  let parsed = null;`,
    `  try { parsed = JSON.parse(matchResult.stdout); } catch {}`,
    `  assert('matching event stdout parses as JSON', parsed !== null, 'stdout: ' + matchResult.stdout);`,
    `  assert('matching event injects non-empty context', parsed && typeof parsed.context === 'string' && parsed.context.length > 0, 'context: ' + (parsed && parsed.context));`,
    ``,
    `  const nonMatchResult = run(${JSON.stringify(`${hookName}.allow.json`)});`,
    `  assert('non-matching event exits 0', nonMatchResult.exit === 0, 'got exit ' + nonMatchResult.exit);`,
    `  assert('non-matching event silent', nonMatchResult.stdout.trim().length === 0, 'stdout: ' + nonMatchResult.stdout);`,
    `} else {`,
    `  console.log('FAIL: unknown runner mode ' + MODE);`,
    `  process.exit(1);`,
    `}`,
    ``,
    `console.log('');`,
    `console.log(pass + ' passed, ' + fail + ' failed.');`,
    `process.exit(fail === 0 ? 0 : 1);`,
    ``,
  ].join('\n');
}

function forwardSlash(p) {
  return String(p).replace(/\\/g, '/');
}

module.exports = { generateRunner };
