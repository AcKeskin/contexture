'use strict';

// Runner for wrap-terminus-recovery. Payloads are documented-shape
// SessionStart events (source field; no matcher in the payload). The hook is
// opt-in, so a fake home carries the enabling hook-config.json.

const h = require('./harness');

const t = h.makeAsserter('wrap-terminus-recovery');

const enabledHome = h.makeTempHome('cc-hooks-wtr-on-');
h.writeHookConfig(enabledHome, { wrapTerminus: { enabled: true } });
const disabledHome = h.makeTempHome('cc-hooks-wtr-off-');

// Enabled + source=compact + unclosed ship in the transcript → /wrap nudge.
{
  const r = h.runHook(
    'wrap-terminus-recovery',
    h.loadPayload('wrap-terminus-recovery.trigger.json'),
    { home: enabledHome }
  );
  t.assert('enabled trigger exits 0', r.exit === 0, 'exit ' + r.exit);
  const ctx = h.additionalContext(r.stdout, 'SessionStart');
  t.assert(
    'enabled trigger emits SessionStart additionalContext naming the source verb',
    typeof ctx === 'string' && ctx.includes('compacted') && ctx.includes('/wrap'),
    'stdout: ' + r.stdout
  );
}

// Enabled but the terminus already ran (CHANGELOG write after the ship) → silent.
{
  const r = h.runHook(
    'wrap-terminus-recovery',
    h.loadPayload('wrap-terminus-recovery.silent.json'),
    { home: enabledHome }
  );
  t.assert('closed-ship transcript exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('closed-ship transcript is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

// Not enabled → silent even with an unclosed ship.
{
  const r = h.runHook(
    'wrap-terminus-recovery',
    h.loadPayload('wrap-terminus-recovery.trigger.json'),
    { home: disabledHome }
  );
  t.assert('disabled exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('disabled is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

t.report();
