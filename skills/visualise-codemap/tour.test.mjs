// node --test skills/visualise-codemap/tour.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTour, codetour, draft, markdown } from './tour.mjs';
import { pageData } from './map-page.mjs';

const sym = (name, line, exported = true) => ({ name, kind: 'function', line, exported });
const json = {
  project: 'shop',
  entryPoints: [{ rel: 'src/cli.ts', role: 'cli' }],
  files: {
    'src/cli.ts': { lang: 'ts', lines: 40, purpose: 'Command line entry', imports: ['src/orders.ts', 'src/log.ts'], symbols: [sym('helper', 3, false), sym('main', 10)] },
    'src/orders.ts': { lang: 'ts', lines: 80, purpose: 'Order rules', imports: ['src/money.ts'], importedBy: ['src/cli.ts', 'src/api.ts'], symbols: [sym('place', 5)] },
    'src/money.ts': { lang: 'ts', lines: 20, purpose: 'Money maths', importedBy: ['src/orders.ts'], symbols: [sym('add', 2)] },
    'src/log.ts': { lang: 'ts', lines: 10, importedBy: ['src/cli.ts'] },
    'src/api.ts': { lang: 'ts', lines: 30, imports: ['src/orders.ts'] },
    'src/orders.test.ts': { lang: 'ts', lines: 30, imports: ['src/orders.ts'] },
    'README.md': { lang: 'markdown', lines: 5 },
  },
  callSequences: [{ file: 'src/cli.ts', caller: 'main', callees: ['place', 'log'] }, { file: 'src/cli.ts', caller: 'helper', callees: ['x'] }],
};

test('draft starts at the entry point, follows its imports, skips tests and prose', () => {
  const t = draft(json, { stops: 4 });
  assert.equal(t.drafted, true);
  assert.deepEqual(t.stops.map((s) => s.file), ['src/cli.ts', 'src/orders.ts', 'src/log.ts', 'src/money.ts']);
  assert.equal(t.stops[0].line, 10, 'opens at the exported symbol that calls the most');
  assert.equal(t.stops[0].why, 'Command line entry. Entry point (cli).');
  assert.match(t.stops[1].why, /^Order rules\. Imported by cli\.ts\. Used by 2 files\.$/);
});

test('with components, one stop per component from the entry side down', () => {
  const components = { components: [
    { id: 'core', name: 'Core', paths: ['src/orders.ts', 'src/money.ts'] },
    { id: 'edge', name: 'Edge', paths: ['src/cli.ts', 'src/api.ts', 'src/log.ts'] },
  ] };
  const t = draft(json, { stops: 2, components });
  assert.deepEqual(t.stops.map((s) => s.file), ['src/cli.ts', 'src/orders.ts']);
  assert.match(t.stops[0].why, /Start of Edge\. Entry point \(cli\)\./);
});

test('checkTour catches unknown files, lines past the end and empty reasons', () => {
  const bad = { stops: [{ file: 'nope.ts', why: 'x' }, { file: 'src/log.ts', line: 99, why: '' }] };
  const p = checkTour(bad, json);
  assert.ok(p.some((x) => x.includes('nope.ts is not in the codemap')));
  assert.ok(p.some((x) => x.includes('line 99 is past the end')));
  assert.ok(p.some((x) => x.includes('stop 2: no why')));
  assert.deepEqual(checkTour(draft(json), json), []);
});

test('markdown and CodeTour output', () => {
  const t = draft(json, { stops: 2 });
  assert.match(markdown(t), /1\. \*\*cli\.ts · main\*\* `src\/cli\.ts:10`/);
  assert.match(markdown(t), /Drafted from the codemap only/);
  const c = codetour(t);
  assert.equal(c.$schema, 'https://aka.ms/codetour-schema');
  assert.deepEqual(c.steps[0], { file: 'src/cli.ts', line: 10, title: 'cli.ts · main', description: t.stops[0].why });
});

test('page data keeps tour stops whose file is still mapped', () => {
  const tour = { drafted: false, stops: [{ file: 'src/cli.ts', line: 10, why: 'a' }, { file: 'gone.ts', line: 1, why: 'b' }] };
  assert.deepEqual(pageData(json, { tour }).tour, { drafted: false, stops: [{ file: 'src/cli.ts', line: 10, why: 'a' }] });
});
