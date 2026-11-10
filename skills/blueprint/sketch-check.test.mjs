import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, sections } from './sketch-check.mjs';

const F = '```';
const sketch = `# Sketch: webhooks

## States

${F}mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Sending
  Sending --> Waiting : 5xx
  Sending --> Delivered
  Delivered --> [*]
${F}

## Sequence

${F}mermaid
sequenceDiagram
  actor Endpoint
  participant Outbox
  participant Dispatcher
  participant Ghost
  Dispatcher->>Outbox: claim_due()
${F}

## Classes

${F}mermaid
classDiagram
  class Dispatcher
  class OutboxRepo {
    <<interface>>
  }
  Dispatcher --> OutboxRepo
  Dispatcher --> Signer
${F}

## Build order

${F}mermaid
flowchart TD
  A["1 · OutboxRepo"] --> B["2 · Dispatcher"]
${F}

## Interfaces

${F}python
class Status(Enum):
    PENDING = "pending"
    SENDING = "sending"
    RETRYING = "retrying"
    DELIVERED = "delivered"

class Dispatcher:
    def run_once(self) -> int: ...

class OutboxRepo(Protocol):
    def claim_due(self) -> list: ...
${F}
`;

test('sections give 1-based line ranges', () => {
  const s = sections(sketch);
  assert.deepEqual(s.map(x => x.name), ['States', 'Sequence', 'Classes', 'Build order', 'Interfaces']);
  assert.equal(sketch.split('\n')[s[0].start - 1], '## States');
});

test('name check finds each mismatch', () => {
  const { notes } = check(sketch);
  assert.ok(notes.some(n => n.startsWith('sequence: Outbox has no class (OutboxRepo?)')));
  assert.ok(notes.some(n => n.startsWith('sequence: Ghost has no class')));
  assert.ok(!notes.some(n => n.includes('Endpoint')), 'actor is external');
  assert.ok(notes.some(n => n === 'states: differ from Status. Only in diagram: Waiting. Only in enum: RETRYING.'));
  assert.ok(notes.includes('build order: no step for Signer'));
  assert.ok(notes.includes('interfaces: no signature for Signer'));
});

test('clean sketch passes', () => {
  const clean = sketch.replace('participant Ghost\n', '').replace('participant Outbox', 'participant OutboxRepo')
    .replace('Dispatcher->>Outbox:', 'Dispatcher->>OutboxRepo:').replace('Waiting', 'Retrying')
    .replace('  Dispatcher --> Signer\n', '');
  assert.deepEqual(check(clean).notes, []);
});

test('brace enums and %% external work', () => {
  const t = `## States\n${F}mermaid\nstateDiagram-v2\n  [*] --> Open\n  Open --> Closed\n${F}\n## Sequence\n${F}mermaid\n%% external: Bank\nsequenceDiagram\n  participant Bank\n${F}\n## Interfaces\n${F}ts\nenum DoorState { Open, Closed }\n${F}\n`;
  assert.deepEqual(check(t).notes, []);
});

test('CRLF files, reversed arrows and (str, Enum) work', () => {
  const t = `## States\n${F}mermaid\nstateDiagram-v2\n  [*] --> Open\n${F}\n## Classes\n${F}mermaid\nclassDiagram\n  Dog --|> Animal\n  Impl ..|> Port\n${F}\n## Interfaces\n${F}python\nclass S(str, Enum):\n    OPEN = "o"\n    SHUT = "s"\nclass Dog: ...\nclass Animal: ...\nclass Impl: ...\n${F}\n`;
  const want = ['states: differ from S. Only in enum: SHUT.', 'interfaces: no signature for Port'];
  assert.deepEqual(check(t).notes, want);
  assert.deepEqual(check(t.replace(/\n/g, '\r\n')).notes, want);
});
