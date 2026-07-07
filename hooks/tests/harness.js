'use strict';

// Shared test harness for the hooks' fixture runners. Spawns a hook with a
// JSON payload on stdin and a controlled fake home directory so tests never
// read or write the real ~/.claude.
//
// Payload fixtures use the documented hook-event shape: SessionStart stdin
// carries session_id / transcript_path / cwd / hook_event_name / source
// (startup | resume | clear | compact). There is no `matcher` field in the
// payload — matcher exists only in the settings.json registration. A hook
// that gates on payload.matcher will stay silent against these fixtures and
// fail its trigger assertion.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

function makeTempHome(prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return home;
}

function writeHookConfig(home, config) {
  fs.writeFileSync(
    path.join(home, '.claude', 'hook-config.json'),
    JSON.stringify(config, null, 2) + '\n'
  );
}

// Load a payload fixture, substituting __FIXTURES__ with the absolute
// fixtures dir so transcript_path resolves wherever the repo is cloned.
function loadPayload(name) {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
  return raw.replace(/__FIXTURES__/g, FIXTURES_DIR.replace(/\\/g, '/'));
}

function runHook(hookName, payloadJson, { home } = {}) {
  const env = Object.assign({}, process.env);
  // The env var is a legacy fallback; tests must exercise payload-derived
  // session identity.
  delete env.CLAUDE_SESSION_ID;
  if (home) {
    env.USERPROFILE = home; // Windows os.homedir()
    env.HOME = home; // POSIX os.homedir()
  }
  const r = spawnSync('node', [path.join(HOOKS_DIR, hookName + '.js')], {
    input: payloadJson,
    encoding: 'utf8',
    env,
  });
  return { exit: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Parse a hook's stdout as the documented context emit; returns the
// additionalContext string, or null when stdout is not that shape.
function additionalContext(stdout, expectedEvent) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const hso = parsed && parsed.hookSpecificOutput;
  if (!hso) return null;
  if (expectedEvent && hso.hookEventName !== expectedEvent) return null;
  return typeof hso.additionalContext === 'string' ? hso.additionalContext : null;
}

function makeAsserter(suiteName) {
  let pass = 0;
  let fail = 0;
  return {
    assert(name, cond, detail) {
      if (cond) {
        console.log('PASS: ' + name);
        pass++;
      } else {
        console.log('FAIL: ' + name + (detail ? ' — ' + detail : ''));
        fail++;
      }
    },
    report() {
      console.log('');
      console.log(`${suiteName}: ${pass} passed, ${fail} failed.`);
      process.exit(fail === 0 ? 0 : 1);
    },
  };
}

module.exports = {
  HOOKS_DIR,
  FIXTURES_DIR,
  makeTempHome,
  writeHookConfig,
  loadPayload,
  runHook,
  additionalContext,
  makeAsserter,
};
