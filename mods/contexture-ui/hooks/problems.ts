// Problems from the output of test, type-check and lint commands Claude ran
// through Bash. Pure: no $.
import type { CheckKind, CheckRun, Problem } from '../types'

export type BashUse = { command: string; text: string; isError: boolean; isBackground?: boolean }

const MAX_PROBLEMS = 50
const MAX_TEXT = 200
// Longer lines are skipped: no runner prints a problem that long, and the
// patterns slow down on them.
const MAX_LINE = 2_000

// Each runner as the start of one command in a chain (`cd x && npx tsc`).
const RUNNERS: ReadonlyArray<[CheckKind, RegExp]> = [
  [
    'test',
    /^(bun test|vitest|jest|pytest|go test|cargo test|deno test|node --test|claude plugin test|(npm|pnpm|yarn|bun)( run)? test|npm t)\b/,
  ],
  ['type', /^(tsc|vue-tsc|mypy|pyright|cargo check|(npm|pnpm|yarn|bun)( run)? (typecheck|type-check|tsc))\b/],
  ['lint', /^(eslint|ruff|flake8|pylint|biome|golangci-lint|cargo clippy|(npm|pnpm|yarn|bun)( run)? lint)\b/],
]
const PREFIX = /^((\w+=\S*\s+)+|npx\s+|bunx\s+|pnpm (exec|dlx)\s+|uv run\s+|poetry run\s+|python3? -m\s+|time\s+)/

// Quoted text and heredoc bodies are data, not commands: a commit message
// that says "npm test" runs no tests.
function withoutData(command: string): string {
  const heredoc = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(\n|$)/g
  return command.replace(heredoc, '\n').replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '""')
}

function segments(command: string): string[] {
  return withoutData(command).split(/&&|\|\||[;|\n]/).map(part => {
    let s = part.trim()
    for (let m = PREFIX.exec(s); m; m = PREFIX.exec(s)) s = s.slice(m[0].length)
    return s
  })
}

// Test wins over type over lint: `tsc && jest` is a test run.
export function checkKind(command: string): CheckKind | undefined {
  const parts = segments(command)
  return RUNNERS.find(([, re]) => parts.some(p => re.test(p)))?.[0]
}

// Long texts keep their head and tail, so two long names still differ.
function clip(text: string): string {
  const one = text.trim().replace(/\s+/g, ' ')
  return one.length > MAX_TEXT ? `${one.slice(0, 120)}…${one.slice(-(MAX_TEXT - 121))}` : one
}

function make(kind: CheckKind, title: string, detail: string, file?: string, line?: number): Problem {
  const where = file === undefined ? '' : `${file}:${line ?? ''}`
  return { key: `${kind}|${where}|${title}`, kind, file, line, title: clip(title), detail: clip(detail) }
}

// tsc: `src/a.ts(7,3): error TS2322: msg` or pretty `src/a.ts:7:3 - error TS2322: msg`.
const TSC = /^(.+?)(?:\((\d+),\d+\):|:(\d+):\d+ -) error (TS\d+): (.+)$/
// ruff, flake8, mypy, eslint -f unix, go vet: `file:line[:col]: [error:] msg`.
const COLON = /^((?:[A-Za-z]:)?[\w./\\-]+\.\w+):(\d+)(?::\d+)?:\s*(?:(?:error|warning|note):\s*)?(.+)$/
// eslint stylish: a file line, then `  7:3  error  msg  rule`.
const STYLISH = /^\s+(\d+):\d+\s+(error|warning)\s+(.+?)(?:\s{2,}(\S+))?$/
const PATH_LINE = /^(\/|[A-Za-z]:\\|\.{0,2}[\w-])[\w./\\-]*\.\w+:?$/
// rustc, clippy and ruff's full format: a message line, then ` --> file:line:col`.
const ARROW_HEAD = /^(error(\[E\d+\])?|warning|[A-Z]{1,4}\d{3,4})(:| \[\*\]| )\s*(.+)$/
const ARROW = /^\s*--> ([\w./\\-]+\.\w+):(\d+):\d+/
// biome: `src/a.ts:3:5 lint/suspicious/noX ━━━`, its message on a later `×` line.
const BIOME = /^([\w./\\-]+\.\w+):(\d+):\d+ ((lint|format)\/\S+)/
// go: `./a.go:3:2: undefined: x`, from a build that a test run starts.
const GO_BUILD = /^(\.?\/?[\w./-]+\.go):(\d+):\d+: (.+)$/
const ERROR_LINE = /^(error|Error|AssertionError|TypeError|ReferenceError|Expected|expect\(|assert)/

function tscProblem(kind: CheckKind, line: string): Problem | undefined {
  const t = TSC.exec(line)
  if (!t) return undefined
  const n = Number(t[2] ?? t[3])
  return make(kind, `line ${n} · ${t[4]}`, t[5] ?? '', t[1], n)
}

// The problem at `at` takes the first later line that says what went wrong,
// for runners that print it after the failure line.
type Awaiting = { at: number; isDetail: RegExp }

function fill(out: Problem[], wait: Awaiting | undefined, line: string): boolean {
  const p = wait === undefined ? undefined : out[wait.at]
  if (!wait || !p || p.detail !== '' || !wait.isDetail.test(line)) return false
  out[wait.at] = { ...p, detail: clip(line.replace(/^[×!✖]\s*/, '')) }
  return true
}

function parseType(kind: CheckKind, lines: readonly string[]): Problem[] {
  const out: Problem[] = []
  let file: string | undefined
  let head: { title: string; detail: string } | undefined
  let wait: Awaiting | undefined
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (fill(out, wait, line.trim())) continue
    const t = tscProblem(kind, line)
    if (t) {
      out.push(t)
      continue
    }
    const a = ARROW.exec(line)
    if (a && head) {
      const n = Number(a[2])
      out.push(make(kind, `line ${n} · ${head.title}`, head.detail, a[1], n))
      head = undefined
      continue
    }
    const h = ARROW_HEAD.exec(line)
    if (h && !/^warning: .*\d+ warnings? emitted/.test(line)) {
      head = { title: (h[1] ?? '').replace(/^error\[(E\d+)\]$/, '$1'), detail: h[4] ?? '' }
      continue
    }
    const b = BIOME.exec(line)
    if (b) {
      const n = Number(b[2])
      out.push(make(kind, `line ${n} · ${b[3]}`, '', b[1], n))
      wait = { at: out.length - 1, isDetail: /^[×!✖]\s+\S/ }
      continue
    }
    const s = STYLISH.exec(line)
    if (s && file !== undefined) {
      const n = Number(s[1])
      out.push(make(kind, `line ${n}${s[4] ? ` · ${s[4]}` : ''}`, s[3] ?? '', file, n))
      continue
    }
    if (PATH_LINE.test(line)) {
      file = line.replace(/:$/, '')
      continue
    }
    const c = COLON.exec(line)
    if (c && !/^\s*(note|Found|Success)/.test(c[3] ?? '')) {
      const n = Number(c[2])
      out.push(make(kind, `line ${n}`, c[3] ?? '', c[1], n))
    }
  }
  return out
}

// Test runners: bun `(fail) name` (error before it), vitest `FAIL file > a > b`
// and jest `● a › b` (error after), pytest `FAILED file::name - msg`, go
// `--- FAIL: Name` (then `a_test.go:12: msg`), cargo `test x ... FAILED`.
function parseTests(lines: readonly string[]): Problem[] {
  const out: Problem[] = []
  let file: string | undefined
  let lastError = ''
  let wait: Awaiting | undefined
  let goAt: number | undefined
  for (const raw of lines) {
    const line = raw.trim()
    const goLine = /^([\w./-]+_test\.go):(\d+): (.+)$/.exec(line)
    const goFail = goAt === undefined ? undefined : out[goAt]
    if (goLine && goAt !== undefined && goFail && goFail.file === undefined) {
      out[goAt] = make('test', goFail.title, goLine[3] ?? '', goLine[1], Number(goLine[2]))
      goAt = undefined
      continue
    }
    if (fill(out, wait, line)) continue
    const head = /^(?:FAIL\s+|❯\s+)?([\w./\\-]+\.(?:test|spec)\.\w+|[\w./\\-]+_test\.go|[\w./\\-]*test_[\w-]+\.py):?(?:\s|$)/.exec(line)
    if (head && !line.startsWith('(')) file = head[1]
    if (ERROR_LINE.test(line) && lastError === '') lastError = line
    const bun = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line)
    const vitest = /^(?:FAIL|×|✗)\s+([\w./\\-]+\.\w+)\s+>\s+(.+?)(?:\s+\d+m?s)?$/.exec(line)
    const jest = /^● (.+ › .+)$/.exec(line)
    const pytest = /^(?:FAILED|ERROR) ([\w./\\-]+\.py)::(.+?)(?: - (.+))?$/.exec(line)
    const collect = /^ERROR ([\w./\\-]+\.py)(?: - (.+))?$/.exec(line)
    const go = /^--- FAIL: (\S+)/.exec(line)
    const cargo = /^test (\S+) \.\.\. FAILED$/.exec(line)
    const build = GO_BUILD.exec(line)
    if (bun) out.push(make('test', bun[1] ?? '', lastError, file))
    else if (vitest) out.push(make('test', (vitest[2] ?? '').replace(/ > /g, ' › '), '', vitest[1]))
    else if (jest) out.push(make('test', jest[1] ?? '', '', file))
    else if (pytest) out.push(make('test', pytest[2] ?? '', pytest[3] ?? '', pytest[1]))
    else if (collect) out.push(make('test', 'collection error', collect[2] ?? '', collect[1]))
    else if (go) out.push(make('test', go[1] ?? '', ''))
    else if (cargo) out.push(make('test', cargo[1] ?? '', ''))
    else if (build && !/_test\.go$/.test(build[1] ?? '')) {
      out.push(make('type', `line ${build[2]}`, build[3] ?? '', build[1], Number(build[2])))
    } else continue
    lastError = ''
    wait = vitest || jest ? { at: out.length - 1, isDetail: ERROR_LINE } : undefined
    goAt = go ? out.length - 1 : undefined
  }
  return out
}

// One problem per key; a later copy fills a detail the first lacked.
function dedupe(list: readonly Problem[]): Problem[] {
  const byKey = new Map<string, Problem>()
  for (const p of list) {
    const had = byKey.get(p.key)
    if (!had) byKey.set(p.key, p)
    else if (had.detail === '' && p.detail !== '') byKey.set(p.key, { ...had, detail: p.detail })
  }
  return [...byKey.values()]
}

export function parseRun(use: BashUse): CheckRun | undefined {
  const kind = checkKind(use.command)
  if (kind === undefined) return undefined
  // Colors and CR line ends come off first; the patterns expect plain lines.
  const plain = use.text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  const lines = plain.split(/\r?\n/).filter(l => l.length <= MAX_LINE)
  // A test script can run tsc or rustc first: take their errors too, but no
  // other `file:line` lines, which in test output are stack frames.
  const compiler = lines.filter(l => TSC.test(l) || ARROW.test(l) || ARROW_HEAD.test(l))
  const found = kind === 'test' ? [...parseTests(lines), ...parseType('type', compiler)] : parseType(kind, lines)
  const problems = dedupe(found).slice(0, MAX_PROBLEMS)
  return { command: use.command, kind, isFailed: use.isError || problems.length > 0, problems }
}

// The newest run of each kind, oldest first. A newer run replaces an older one
// even when it ran a narrower set: its output is what holds now. A run in the
// background has no output yet and is skipped; a failed run that names no
// problem (output cut by `| tail`) leaves an older run's problems standing.
export function latestRuns(uses: readonly BashUse[]): CheckRun[] {
  const byKind = new Map<CheckKind, CheckRun>()
  for (const use of uses) {
    const run = use.isBackground === true ? undefined : parseRun(use)
    if (!run) continue
    const had = byKind.get(run.kind)
    if (had && had.problems.length > 0 && run.problems.length === 0 && use.isError) continue
    byKind.delete(run.kind)
    byKind.set(run.kind, run)
  }
  return [...byKind.values()]
}

// Every run's problems, each once: `npm test` and `tsc` can both report one.
export function allProblems(runs: readonly CheckRun[]): Problem[] {
  return dedupe(runs.flatMap(r => r.problems))
}

function problemWhere(p: Problem): string {
  if (p.file === undefined) return ''
  return p.line === undefined ? p.file : `${p.file}:${p.line}`
}

export function fixText(p: Problem): string {
  const where = problemWhere(p)
  return `Fix ${where === '' ? '' : `${where}: `}${p.title}${p.detail === '' ? '' : `: ${p.detail}`}`
}

export function dispatchText(picked: readonly Problem[]): string {
  return ['/dispatch fix these:', ...picked.map(p => `- ${fixText(p).replace(/^Fix /, '')}`)].join('\n')
}

export const RUN_CHECKS =
  "Run checks: first the tests this session's changes reach (update-codemap's affected-tests.mjs lists them), then lint. Report what fails; don't fix yet."

const NOUNS: Record<CheckKind, [string, string]> = {
  test: ['failing test', 'failing tests'],
  type: ['type error', 'type errors'],
  lint: ['lint problem', 'lint problems'],
}

export function summary(runs: readonly CheckRun[]): string {
  if (runs.length === 0) return 'No test, type or lint runs yet.'
  const list = allProblems(runs)
  const parts = (['test', 'type', 'lint'] as const).flatMap(kind => {
    const n = list.filter(p => p.kind === kind).length
    const noun = NOUNS[kind]
    return n === 0 ? [] : [`${n} ${n === 1 ? noun[0] : noun[1]}`]
  })
  if (parts.length > 0) return parts.join(', ')
  return runs.some(r => r.isFailed) ? 'A check failed; its output names no file.' : 'No problems in the last runs.'
}
