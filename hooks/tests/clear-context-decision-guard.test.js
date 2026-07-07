'use strict';

// Runner for clear-context-decision-guard. Payloads are documented-shape
// SessionStart events (source field; no matcher in the payload).

const h = require('./harness');

const t = h.makeAsserter('clear-context-decision-guard');

// source=clear + transcript with an unpersisted decision → recap nudge.
{
  const r = h.runHook(
    'clear-context-decision-guard',
    h.loadPayload('clear-context-decision-guard.trigger.json')
  );
  t.assert('trigger exits 0', r.exit === 0, 'exit ' + r.exit);
  const ctx = h.additionalContext(r.stdout, 'SessionStart');
  t.assert(
    'trigger emits SessionStart additionalContext naming the source verb',
    typeof ctx === 'string' && ctx.includes('cleared') && ctx.includes('/recap'),
    'stdout: ' + r.stdout
  );
}

// Same transcript but recapped after the decision → silent.
{
  const r = h.runHook(
    'clear-context-decision-guard',
    h.loadPayload('clear-context-decision-guard.silent.json')
  );
  t.assert('recapped transcript exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('recapped transcript is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

// Missing transcript_path → fail open, silent.
{
  const r = h.runHook(
    'clear-context-decision-guard',
    JSON.stringify({ session_id: 'test-session-a', hook_event_name: 'SessionStart', source: 'clear' })
  );
  t.assert('missing transcript exits 0', r.exit === 0, 'exit ' + r.exit);
  t.assert('missing transcript is silent', r.stdout.trim() === '', 'stdout: ' + r.stdout);
}

t.report();
