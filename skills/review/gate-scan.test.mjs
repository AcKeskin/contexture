import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from './gate-scan.mjs';

const diff = (path, hunk) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,4 +1,4 @@\n${hunk}\n`;
const tagsOf = (text) => scan(text).tags.map((t) => t.tag);

test('skipped and removed tests are tagged', () => {
  const d = diff('src/cart.test.ts', " describe('cart', () => {\n-  it('rejects expired coupon', () => {\n+  it.skip('applies coupon', () => {");
  assert.deepEqual(tagsOf(d).sort(), ['test-removed', 'test-skipped']);
});

test('suppressions are tagged in any language', () => {
  for (const line of ['// eslint-disable-next-line no-unused-vars', 'x = f()  # type: ignore', '#pragma warning disable CS8618', '@warning_ignore("unused_variable")', '#[allow(dead_code)]']) {
    assert.deepEqual(tagsOf(diff('src/a.txt', `+${line}`)), ['suppression'], line);
  }
});

test('a raised timeout in a test is gate-relaxed, a lowered one is not', () => {
  assert.deepEqual(tagsOf(diff('tests/test_api.py', '-TIMEOUT = 5\n+TIMEOUT = 30')), ['gate-relaxed']);
  assert.deepEqual(tagsOf(diff('tests/test_api.py', '-TIMEOUT = 30\n+TIMEOUT = 5')), []);
});

test('a lowered coverage threshold in config is gate-relaxed', () => {
  assert.deepEqual(tagsOf(diff('pyproject.toml', '-fail_under = 90\n+fail_under = 70')), ['gate-relaxed']);
});

test('an exact assertion loosened to a bound is gate-relaxed', () => {
  assert.deepEqual(tagsOf(diff('src/orders.test.js', '-  expect(items.length).toBe(3);\n+  expect(items.length).toBeGreaterThan(0);')), ['gate-relaxed']);
});

test('CI bypass is tagged only in gate paths', () => {
  assert.deepEqual(tagsOf(diff('.github/workflows/ci.yml', '+    continue-on-error: true')), ['gate-bypass']);
  assert.deepEqual(tagsOf(diff('src/run.py', '+    continue-on-error: true')), []);
});

test('placeholders and env sniffing are tagged only in product code', () => {
  assert.deepEqual(tagsOf(diff('src/pay.py', '+    raise NotImplementedError')), ['placeholder']);
  assert.deepEqual(tagsOf(diff('tests/test_pay.py', '+    raise NotImplementedError')), []);
  assert.deepEqual(tagsOf(diff('src/pay.js', "+if (process.env.CI) return true;")), ['env-sniff']);
});

test('swallowed errors are tagged', () => {
  assert.deepEqual(tagsOf(diff('src/a.js', '+try { send() } catch (e) {}')), ['swallowed-error']);
  assert.deepEqual(tagsOf(diff('src/a.py', '+    except Exception: pass')), ['swallowed-error']);
});

test('a snapshot changed with no test change is tagged; with one it is only listed', () => {
  const snap = diff('src/__snapshots__/view.test.ts.snap', '-old\n+new');
  assert.deepEqual(tagsOf(snap), ['snapshot-without-test']);
  const both = snap + diff('src/view.test.ts', "+  it('renders', () => {});");
  assert.deepEqual(tagsOf(both), []);
  assert.equal(scan(both).listed.length, 2);
});

test('generated files are listed and skipped', () => {
  const r = scan(diff('package-lock.json', '+  "x": 1') + diff('api/v1/user.pb.go', '+// eslint-disable') + diff('assets/icon.png.import', '+x'));
  assert.deepEqual(r.generated, ['package-lock.json', 'api/v1/user.pb.go', 'assets/icon.png.import']);
  assert.deepEqual(r.tags, []);
});

test('plain product changes produce nothing', () => {
  const r = scan(diff('src/money.py', '-    return round(x, 2)\n+    return round(x, 4)'));
  assert.deepEqual(r.tags, []);
  assert.equal(r.listed.length, 0);
});

test('line numbers follow the new file', () => {
  const d = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -10,3 +10,3 @@\n ctx\n-old\n+// @ts-ignore\n';
  assert.equal(scan(d).tags[0].line, 11);
});
