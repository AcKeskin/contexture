#!/usr/bin/env node
// Gate scan: list the hunks of a diff that touch a gate (anything that would have
// made the change fail: a test, an assertion, a threshold, a timeout, a lint or
// type check, a CI job, a snapshot), tag the ones that loosen it, and list
// generated files the review should not read. Prints facts, never verdicts; the
// review reads each tagged hunk with one question.
//
//   node gate-scan.mjs --git <ref>        # diff <ref>...HEAD in the current repo
//   node gate-scan.mjs --file <diff>      # a saved unified diff (e.g. gh pr diff N)
//
// Output, one fact per line:
//   GATE_SUMMARY: listed=<hunks in gate paths> tagged=<tagged lines> generated=<files>
//   TAG <tag> <path>:<line> | <the line, trimmed>
//   LISTED <path> +<added> -<removed>
//   GENERATED <path>
// Exit 0 on success, 2 on bad usage or an unreadable diff.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEST_PATH = /(^|\/)(tests?|__tests__|testdata)\/|(^|\/)test_[^/]+\.(py|gd)$|_test\.(go|py|rs|gd|exs|rb)$|\.(test|spec)\.[cm]?[jt]sx?$|_spec\.rb$|Tests?\.(cs|java|kt|swift)$/;
const CI_PATH = /(^|\/)(\.github\/workflows\/|\.circleci\/|\.husky\/)|(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.ya?ml|Jenkinsfile|\.pre-commit-config\.yaml)$/;
const CONFIG_PATH = /(^|\/)(\.eslintrc[^/]*|eslint\.config\.[^/]+|tsconfig[^/]*\.json|pyproject\.toml|setup\.cfg|\.flake8|ruff\.toml|pytest\.ini|tox\.ini|jest\.config\.[^/]+|vitest\.config\.[^/]+|\.clang-tidy|\.editorconfig|codecov\.ya?ml|\.globalconfig|[^/]*\.ruleset|Directory\.Build\.props|\.golangci\.ya?ml|clippy\.toml|\.coveragerc)$/;
const SNAPSHOT_PATH = /(^|\/)__snapshots__\/|\.snap$|\.golden$|(^|\/)testdata\//;
const GENERATED_PATH = /\.pb\.(go|cc|h|swift|rb|php)$|_pb2(_grpc)?\.py$|\.generated\.[^/]+$|\.g\.(cs|dart)$|\.Designer\.cs$|(^|\/)__generated__\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum|packages\.lock\.json)$|\.min\.(js|css)$|(^|\/)(dist|build)\/|\.import$|\.uid$|\.meta$/;

// Added-line patterns. Each is [tag, regex, where]: where = 'any' | 'test' | 'product' | 'gate'.
const ADDED = [
  ['test-skipped', /\b(it|test|describe|context)\.(skip|only|todo)\s*\(|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|xfail)|@unittest\.skip|\[Ignore\b|\[Fact\s*\(\s*Skip\s*=|\[Theory\s*\(\s*Skip\s*=|#\[ignore\]|\bt\.Skip\(|@Disabled\b|\bpending\s*\(|\bXCTSkip\b/, 'any'],
  ['suppression', /eslint-disable|@ts-(ignore|expect-error|nocheck)|#\s*type:\s*ignore|#\s*noqa|#\s*pylint:\s*disable|#\s*pyright:\s*ignore|#pragma\s+warning\s+disable|\[SuppressMessage|\bNOLINT|#!?\[allow\(|\/\/\s*nolint|rubocop:disable|@SuppressWarnings|@warning_ignore|\/\/\s*@ts-|#\s*mypy:\s*ignore/, 'any'],
  ['gate-bypass', /continue-on-error:\s*true|allow_failure:\s*true|--no-verify\b|\|\|\s*true\s*$|\bset\s+\+e\b|\bexit\s+0\s*$/, 'gate'],
  ['placeholder', /\bNotImplementedError\b|\btodo!\s*\(|\bunimplemented!\s*\(|NotImplementedException|throw\s+new\s+Error\(\s*['"`]not implemented|\bpass\s*#\s*TODO/i, 'product'],
  ['env-sniff', /process\.env\.(CI|NODE_ENV|JEST_WORKER_ID|VITEST)\b|NODE_ENV\s*[!=]==?\s*['"]test['"]|PYTEST_CURRENT_TEST|\bGITHUB_ACTIONS\b|environ(\.get)?\s*[([]\s*['"]CI['"]|GetEnvironmentVariable\(\s*"CI"\s*\)/, 'product'],
  ['swallowed-error', /catch\s*(\([^)]*\))?\s*\{\s*\}|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)|except(\s+[\w.]+(\s+as\s+\w+)?)?\s*:\s*pass\b/, 'any'],
];
const TEST_DECL = /^\s*(it|test|describe)\s*\(|^\s*def\s+test_|^\s*func\s+(Test\w+|test_\w+)\s*\(|^\s*\[(Test|Fact|Theory|TestMethod)\b|^\s*@Test\b|^\s*#\[test\]|^\s*fn\s+test_/;
const LOOSER_UP = /\b(timeout|timeout_?ms|retries|retry|max_?retries|tolerance|epsilon|delta|jitter|max_?diff|maxDiff|rtol|atol|slow)\b/i;
const LOOSER_DOWN = /\b(threshold|min_?score|minimum|min|coverage|required|fail_under|branches|lines|functions|statements|min_?coverage)\b/i;
const EXACT_ASSERT = /\.toBe\(|\.toEqual\(|\.toStrictEqual\(|assertEqual\(|assert_eq!|Assert\.(AreEqual|Equal)\(|assert_eq\(|assert\s+\w[\w.]*\s*==/;
const BOUND_ASSERT = /toBeGreaterThan|toBeLessThan|toBeTruthy|toBeDefined|assertGreater|assertLess|assertTrue|Assert\.(IsTrue|True)\(|assert_true\(|>=|<=|\s>\s|\s<\s/;

function classify(path) {
  if (GENERATED_PATH.test(path)) return 'generated';
  if (SNAPSHOT_PATH.test(path)) return 'snapshot';
  if (TEST_PATH.test(path)) return 'test';
  if (CI_PATH.test(path)) return 'ci';
  if (CONFIG_PATH.test(path)) return 'config';
  return 'product';
}

const num = (s) => {
  const m = s.match(/[:=]\s*(-?\d+(\.\d+)?)/) || s.match(/\(\s*(-?\d+(\.\d+)?)\s*\)/);
  return m ? Number(m[1]) : null;
};

export function parseDiff(text) {
  const files = [];
  let cur = null;
  let newLine = 0;
  let hunk = null;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/ b\/(.+)$/);
      cur = { path: m ? m[1] : '?', hunks: [], added: 0, removed: 0 };
      files.push(cur);
      hunk = null;
    } else if (!cur) {
      continue;
    } else if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).replace(/^b\//, '');
      if (p !== '/dev/null') cur.path = p;
    } else if (raw.startsWith('--- ')) {
      continue;
    } else if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      newLine = m ? Number(m[1]) : 0;
      hunk = { start: newLine, add: [], del: [] };
      cur.hunks.push(hunk);
    } else if (hunk && raw.startsWith('+')) {
      hunk.add.push({ line: newLine, text: raw.slice(1) });
      cur.added++;
      newLine++;
    } else if (hunk && raw.startsWith('-')) {
      hunk.del.push({ line: newLine, text: raw.slice(1) });
      cur.removed++;
    } else if (hunk && !raw.startsWith('\\')) {
      newLine++;
    }
  }
  return files;
}

export function scan(text) {
  const files = parseDiff(text);
  const tags = [];
  const listed = [];
  const generated = [];
  const anyTestChanged = files.some((f) => classify(f.path) === 'test');
  for (const f of files) {
    const kind = classify(f.path);
    if (kind === 'generated') { generated.push(f.path); continue; }
    const gatePath = kind !== 'product';
    if (gatePath) listed.push(f);
    const tag = (t, l) => tags.push({ tag: t, path: f.path, line: l.line, text: l.text.trim().slice(0, 160) });
    if (kind === 'snapshot' && !anyTestChanged) tag('snapshot-without-test', { line: f.hunks[0]?.start ?? 1, text: `+${f.added} -${f.removed}` });
    for (const h of f.hunks) {
      for (const l of h.add) {
        for (const [t, re, where] of ADDED) {
          if (where === 'test' && kind !== 'test') continue;
          if (where === 'product' && kind !== 'product') continue;
          if (where === 'gate' && !(kind === 'ci' || kind === 'config' || /\.(sh|ps1|ya?ml|json|toml)$|(^|\/)(Makefile|package\.json)$/.test(f.path))) continue;
          if (re.test(l.text)) tag(t, l);
        }
      }
      if (kind === 'test') {
        for (const l of h.del) if (TEST_DECL.test(l.text)) tag('test-removed', l);
      }
      if (gatePath || kind === 'product') {
        // A numeric gate moved in the loosening direction, or an exact assertion became a bound.
        for (const d of h.del) {
          const key = (d.text.match(LOOSER_UP) || d.text.match(LOOSER_DOWN) || [])[0];
          const a = key && h.add.find((x) => x.text.includes(key));
          if (a && gatePath) {
            const before = num(d.text);
            const after = num(a.text);
            if (before !== null && after !== null && before !== after) {
              const up = LOOSER_UP.test(key);
              if ((up && after > before) || (!up && after < before)) tag('gate-relaxed', a);
            }
          }
          if (kind === 'test' && EXACT_ASSERT.test(d.text)) {
            const b = h.add.find((x) => BOUND_ASSERT.test(x.text) && !EXACT_ASSERT.test(x.text));
            if (b) tag('gate-relaxed', b);
          }
        }
      }
    }
  }
  return { tags, listed, generated };
}

function main() {
  const args = process.argv.slice(2);
  let text;
  try {
    if (args[0] === '--git' && args[1]) {
      text = execFileSync('git', ['diff', `${args[1]}...HEAD`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } else if (args[0] === '--file' && args[1]) {
      text = readFileSync(args[1], 'utf8');
    } else {
      console.error('usage: node gate-scan.mjs --git <ref> | --file <diff>');
      process.exit(2);
    }
  } catch (err) {
    console.error(`gate-scan: ${err.message.split('\n')[0]}`);
    process.exit(2);
  }
  const { tags, listed, generated } = scan(text);
  console.log(`GATE_SUMMARY: listed=${listed.reduce((n, f) => n + f.hunks.length, 0)} tagged=${tags.length} generated=${generated.length}`);
  for (const t of tags.slice(0, 200)) console.log(`TAG ${t.tag} ${t.path}:${t.line} | ${t.text}`);
  if (tags.length > 200) console.log(`TAG_TRUNCATED: ${tags.length - 200} more`);
  for (const f of listed) console.log(`LISTED ${f.path} +${f.added} -${f.removed}`);
  for (const g of generated) console.log(`GENERATED ${g}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gate-scan.mjs')) main();
