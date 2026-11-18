import { expect, test } from 'claude-code/testing'

import { allProblems, checkKind, dispatchText, fixText, latestRuns, parseRun, summary } from '../hooks/problems'

const BUN = [
  'tests/live.test.ts:',
  '(pass) connects [2ms]',
  'error: expect(received).toBe(expected)',
  '(fail) reconnects after drop [5ms]',
  '      at <anonymous> (/repo/tests/live.test.ts:12:5)',
  '(fail) stops after close [1ms]',
  ' 1 pass',
  ' 2 fail',
].join('\n')

test('commands sort into test, type and lint; others are not checks', () => {
  expect(checkKind('bun test server/')).toBe('test')
  expect(checkKind('cd x && npx tsc -p . | head')).toBe('type')
  expect(checkKind('ruff check .')).toBe('lint')
  expect(checkKind('git status')).toBeUndefined()
})

test('bun test failures carry the file and the error line before them, not stack frames', () => {
  const run = parseRun({ command: 'bun test', text: BUN, isError: true })
  expect(run?.problems.map(p => [p.file, p.title, p.detail])).toEqual([
    ['tests/live.test.ts', 'reconnects after drop', 'error: expect(received).toBe(expected)'],
    ['tests/live.test.ts', 'stops after close', ''],
  ])
})

test('other runners: vitest, jest, pytest, go, cargo', () => {
  const titles = (command: string, text: string) => parseRun({ command, text, isError: true })?.problems.map(p => p.title)
  expect(titles('vitest run', ' FAIL  src/a.test.ts > retry > waits 12ms')).toEqual(['retry › waits'])
  expect(titles('jest', 'FAIL src/a.test.ts\n  ● retry › waits')).toEqual(['retry › waits'])
  expect(titles('pytest -q', 'FAILED tests/test_a.py::test_waits - assert 1 == 2')).toEqual(['test_waits'])
  expect(titles('go test ./...', '--- FAIL: TestWaits (0.00s)')).toEqual(['TestWaits'])
  expect(titles('cargo test', 'test retry::waits ... FAILED')).toEqual(['retry::waits'])
})

test('tsc, colon-style lint and eslint stylish give file, line and message', () => {
  const tsc = parseRun({ command: 'tsc --noEmit', text: "server/retry.ts(7,3): error TS2322: Type 'number' is not assignable to type 'Duration'.", isError: true })
  expect(tsc?.problems[0]).toMatchObject({ file: 'server/retry.ts', line: 7, title: 'line 7 · TS2322' })
  const ruff = parseRun({ command: 'ruff check', text: 'app/x.py:3:1: F401 `os` imported but unused\nFound 1 error.', isError: true })
  expect(ruff?.problems.map(p => [p.file, p.line, p.detail])).toEqual([['app/x.py', 3, 'F401 `os` imported but unused']])
  const eslint = parseRun({ command: 'npx eslint src', text: '/repo/src/a.ts\n  4:10  error  x is unused  no-unused-vars\n', isError: true })
  expect(eslint?.problems[0]).toMatchObject({ file: '/repo/src/a.ts', line: 4, title: 'line 4 · no-unused-vars', detail: 'x is unused' })
})

test('the newest run of a kind replaces the older; a clean run reads as no problems', () => {
  const runs = latestRuns([
    { command: 'bun test', text: BUN, isError: true },
    { command: 'tsc', text: 'a.ts(1,1): error TS1: x', isError: true },
    { command: 'bun test tests/live.test.ts', text: ' 3 pass\n 0 fail', isError: false },
  ])
  expect(runs.map(r => r.command)).toEqual(['tsc', 'bun test tests/live.test.ts'])
  expect(summary(runs)).toBe('1 type error')
  expect(summary(runs.slice(1))).toBe('No problems in the last runs.')
  expect(summary([])).toBe('No test, type or lint runs yet.')
})

test('Fix and Dispatch texts name where and what', () => {
  const [a, b] = parseRun({ command: 'bun test', text: BUN, isError: true })?.problems ?? []
  if (!a || !b) throw new Error('two problems expected')
  expect(fixText(a)).toBe('Fix tests/live.test.ts: reconnects after drop: error: expect(received).toBe(expected)')
  expect(dispatchText([a, b])).toBe(
    '/dispatch fix these:\n- tests/live.test.ts: reconnects after drop: error: expect(received).toBe(expected)\n- tests/live.test.ts: stops after close',
  )
})

test('only a runner at the start of a command counts, after cd, env or npx', () => {
  for (const c of ['cat jest.config.js', 'git commit -m "fix jest config"', 'npm install -D vitest', 'pip install ruff', 'echo "running tsc"', 'grep -rn tsc package.json']) {
    expect(checkKind(c)).toBeUndefined()
  }
  expect(checkKind('cd web && CI=1 npx vitest run | tail -20')).toBe('test')
  expect(checkKind('tsc && jest')).toBe('test')
  expect(checkKind('bun run typecheck')).toBe('type')
  expect(checkKind('npm t')).toBe('test')
  expect(checkKind('uv run ruff check .')).toBe('lint')
})

test('a background run, or a failed run naming nothing, leaves the older problems', () => {
  const failing = { command: 'bun test', text: BUN, isError: true }
  expect(latestRuns([failing, { command: 'bun test', text: 'Running in the background', isError: false, isBackground: true }])[0]?.problems).toHaveLength(2)
  expect(latestRuns([failing, { command: 'bun test | tail -1', text: 'Ran 3 tests', isError: true }])[0]?.problems).toHaveLength(2)
  expect(latestRuns([failing, { command: 'bun test', text: ' 3 pass', isError: false }])[0]?.problems).toEqual([])
})

test('a problem two runs report shows once and counts by its own kind', () => {
  const err = 'src/a.ts(7,3): error TS2322: x'
  const runs = latestRuns([
    { command: 'npm test', text: err, isError: true },
    { command: 'tsc', text: err, isError: true },
  ])
  expect(allProblems(runs)).toHaveLength(1)
  expect(summary(runs)).toBe('1 type error')
})

test('vitest and jest errors go on the test above them; go and rust name their file', () => {
  const vitest = parseRun({
    command: 'vitest run',
    text: ' FAIL  src/a.test.ts > one\nAssertionError: first\n FAIL  src/a.test.ts > two\nAssertionError: second',
    isError: true,
  })
  expect(vitest?.problems.map(p => [p.title, p.detail])).toEqual([
    ['one', 'AssertionError: first'],
    ['two', 'AssertionError: second'],
  ])
  const go = parseRun({ command: 'go test ./...', text: '--- FAIL: TestWaits (0.00s)\n    retry_test.go:12: got 1, want 2', isError: true })
  expect(go?.problems[0]).toMatchObject({ file: 'retry_test.go', line: 12, title: 'TestWaits', detail: 'got 1, want 2' })
  const rust = parseRun({ command: 'cargo test', text: 'error[E0425]: cannot find value `x`\n --> src/lib.rs:3:5', isError: true })
  expect(rust?.problems[0]).toMatchObject({ kind: 'type', file: 'src/lib.rs', line: 3, title: 'line 3 · E0425' })
  const ruff = parseRun({ command: 'ruff check', text: 'F401 [*] `os` imported but unused\n --> src/a.py:1:8', isError: true })
  expect(ruff?.problems[0]).toMatchObject({ file: 'src/a.py', line: 1, title: 'line 1 · F401' })
  const pytest = parseRun({ command: 'pytest', text: 'FAILED tests/test_a.py::test_x[a b] - assert 1\nERROR tests/test_b.py - ImportError: no x', isError: true })
  expect(pytest?.problems.map(p => p.title)).toEqual(['test_x[a b]', 'collection error'])
})

test('very long lines are skipped quickly', () => {
  const started = Date.now()
  parseRun({ command: 'bun test', text: `${'a'.repeat(100_000)}\n  ${' '.repeat(40_000)}x`, isError: true })
  parseRun({ command: 'eslint .', text: `src/a.ts\n ${' '.repeat(40_000)}1:1 error x`, isError: true })
  expect(Date.now() - started).toBeLessThan(200)
})

test('quoted text and heredocs run nothing; colors, CRLF and drive letters parse', () => {
  expect(checkKind('git commit -m "fix retry; npm test passes"')).toBeUndefined()
  expect(checkKind("git commit -F - <<'EOF'\nfix\nnpm test\nEOF")).toBeUndefined()
  expect(checkKind('echo "x" && npm test')).toBe('test')
  const colored = parseRun({ command: 'bun test', text: '\x1b[31m(fail)\x1b[0m reconnects [5ms]\r\nsrc/a.ts(1,1): error TS1: x\r\n', isError: true })
  expect(colored?.problems.map(p => p.title)).toEqual(['reconnects', 'line 1 · TS1'])
  const win = parseRun({ command: 'ruff check', text: 'C:\\repo\\a.py:3:1: F401 unused', isError: true })
  expect(win?.problems[0]).toMatchObject({ file: 'C:\\repo\\a.py', line: 3 })
})
