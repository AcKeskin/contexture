'use strict';

const { mergeHook, formatSettings, unifiedDiff } = require('./settings-merge');

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

// Case A: empty settings → adds event + matcher + hook.
{
  const r = mergeHook({}, { event: 'PreToolUse', matcher: 'Bash', command: 'node /a.js' });
  check('A.status merged', r.status === 'merged');
  check(
    'A.shape',
    r.next.hooks.PreToolUse[0].matcher === 'Bash' &&
      r.next.hooks.PreToolUse[0].hooks[0].command === 'node /a.js' &&
      r.next.hooks.PreToolUse[0].hooks[0].timeout === 5,
    JSON.stringify(r.next)
  );
}

// Case B: existing event, no matching matcher → adds matcher entry.
{
  const before = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /a.js', timeout: 5 }] }] } };
  const r = mergeHook(before, { event: 'PreToolUse', matcher: 'Write', command: 'node /b.js' });
  check('B.status merged', r.status === 'merged');
  check('B.both matchers present', r.next.hooks.PreToolUse.length === 2);
  check(
    'B.original entry untouched',
    r.next.hooks.PreToolUse[0].matcher === 'Bash' &&
      r.next.hooks.PreToolUse[0].hooks[0].command === 'node /a.js'
  );
  check(
    'B.new matcher appended',
    r.next.hooks.PreToolUse[1].matcher === 'Write' &&
      r.next.hooks.PreToolUse[1].hooks[0].command === 'node /b.js'
  );
}

// Case C: existing event + matcher, no duplicate → appends.
{
  const before = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /a.js', timeout: 5 }] }] } };
  const r = mergeHook(before, { event: 'PreToolUse', matcher: 'Bash', command: 'node /b.js' });
  check('C.status merged', r.status === 'merged');
  check('C.appended to same matcher', r.next.hooks.PreToolUse[0].hooks.length === 2);
  check(
    'C.both commands present',
    r.next.hooks.PreToolUse[0].hooks[0].command === 'node /a.js' &&
      r.next.hooks.PreToolUse[0].hooks[1].command === 'node /b.js'
  );
}

// Case D: duplicate command → returns duplicate, no change.
{
  const before = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /a.js', timeout: 5 }] }] } };
  const r = mergeHook(before, { event: 'PreToolUse', matcher: 'Bash', command: 'node /a.js' });
  check('D.status duplicate', r.status === 'duplicate');
  check('D.no next field', r.next === undefined);
}

// Case E: input is not mutated.
{
  const before = { hooks: { PreToolUse: [] } };
  const beforeJson = JSON.stringify(before);
  mergeHook(before, { event: 'PreToolUse', matcher: 'Bash', command: 'node /a.js' });
  check('E.input not mutated', JSON.stringify(before) === beforeJson);
}

// Case F: unrelated keys preserved.
{
  const before = {
    statusLine: { type: 'command', command: 'foo' },
    enabledPlugins: { 'p@m': true },
    hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'node /s.js', timeout: 15 }] }] },
  };
  const r = mergeHook(before, { event: 'PreToolUse', matcher: 'Bash', command: 'node /b.js' });
  check('F.statusLine preserved', JSON.stringify(r.next.statusLine) === JSON.stringify(before.statusLine));
  check('F.enabledPlugins preserved', JSON.stringify(r.next.enabledPlugins) === JSON.stringify(before.enabledPlugins));
  check('F.SessionStart preserved', JSON.stringify(r.next.hooks.SessionStart) === JSON.stringify(before.hooks.SessionStart));
  check('F.PreToolUse added', r.next.hooks.PreToolUse[0].matcher === 'Bash');
}

// Case G: formatSettings produces 2-space indent + trailing newline.
{
  const text = formatSettings({ a: 1 });
  check('G.format trailing newline', text.endsWith('\n'));
  check('G.format 2-space indent', text.includes('  "a": 1'));
}

// Case H: unifiedDiff produces visible changes.
{
  const d = unifiedDiff('a\nb\nc\n', 'a\nb-changed\nc\nd\n');
  check('H.diff has minus', d.includes('- b'));
  check('H.diff has plus', d.includes('+ b-changed'));
  check('H.diff shows added line', d.includes('+ d'));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
