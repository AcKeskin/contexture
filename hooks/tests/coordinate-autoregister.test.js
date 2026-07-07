'use strict';

// Runner for coordinate-autoregister. Payloads are documented-shape
// SessionStart events (source field; no matcher in the payload). The hook is
// opt-in, so a fake home carries the enabling hook-config.json.

const h = require('./harness');

const t = h.makeAsserter('coordinate-autoregister');

const enabledHome = h.makeTempHome('cc-hooks-car-on-');
h.writeHookConfig(enabledHome, { coordinateAuto: { enabled: true } });
const disabledHome = h.makeTempHome('cc-hooks-car-off-');

// Enabled → register/check nudge on any SessionStart source.
{
  const r = h.runHook(
    'coordinate-autoregister',
    h.loadPayload('session-start.startup.json'),
    { home: enabledHome }
  );
  t.assert('enabled exits 0', r.exit === 0, 'exit ' + r.exit);
  const ctx = h.additionalContext(r.stdout, 'SessionStart');
  t.assert(
    'enabled emits SessionStart additionalContext',
    typeof ctx === 'string' && ctx.includes('Register this session'),
    'stdout: ' + r.stdout
  );
}

// Not enabled → silent.
{
  const r = h.runHook(
    'coordinate-autoregister',
    h.loadPayload('session-start.startup.json'),
    { home: disabledHome }
  );
  t.assert('disabled exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('disabled is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

t.report();
