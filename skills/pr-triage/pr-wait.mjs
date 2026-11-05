#!/usr/bin/env node
// pr-wait: watch one PR and print one line per new event. Read-only: it only
// runs `gh pr view`, `gh repo view` and a GraphQL query; it never writes.
//
//   node pr-wait.mjs <pr> [--repo owner/name] [--until ready|green|any-change]
//                         [--interval 60] [--timeout 55]
//
// Exit codes:
//   0  the --until condition holds, or the PR merged
//   1  it needs you: a check failed, a conflict, changes requested, a new
//      comment or open thread from someone, or the PR closed
//   2  bad input, gh failed, or another pr-wait already watches this PR
//   3  --timeout minutes passed with no exit; start it again
//
// Run it under the Monitor tool so each line wakes the session. It remembers
// what it already printed (in the OS temp dir), so a restart prints only news.
// Adapted from t3dotgg/tstack skills/babysit-pr/scripts/pr-wait (read 2026-11-05).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GH = process.env.PR_WAIT_GH || 'gh';
const FAIL = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: pr-wait.mjs <pr> [--repo owner/name] [--until ready|green|any-change] [--interval 60] [--timeout 55]');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { until: 'ready', interval: 60, timeout: 55 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = argv[++i];
    else if (a === '--until') o.until = argv[++i];
    else if (a === '--interval') o.interval = Number(argv[++i]);
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (/^#?\d+$/.test(a)) o.pr = Number(a.replace('#', ''));
    else usage(`unknown argument: ${a}`);
  }
  if (!o.pr) usage('missing PR number');
  if (!['ready', 'green', 'any-change'].includes(o.until)) usage(`bad --until: ${o.until}`);
  if (!(o.interval >= 0) || !(o.timeout > 0)) usage('bad --interval or --timeout');
  return o;
}

function gh(args) {
  return execFileSync(GH, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function repoOf(o) {
  if (o.repo) {
    const [owner, name] = o.repo.split('/');
    if (!owner || !name) usage(`bad --repo: ${o.repo}`);
    return { owner, name };
  }
  const r = JSON.parse(gh(['repo', 'view', '--json', 'owner,name']));
  return { owner: r.owner.login, name: r.name };
}

const THREADS = `query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){
reviewThreads(first:100){nodes{id isResolved comments(last:1){nodes{id author{login} path}}}}}}}`;

function snapshot(repo, pr) {
  const full = `${repo.owner}/${repo.name}`;
  const v = JSON.parse(
    gh(['pr', 'view', String(pr), '--repo', full, '--json', 'state,mergeStateStatus,headRefOid,reviewDecision,statusCheckRollup,reviews,comments,author,url'])
  );
  const g = JSON.parse(gh(['api', 'graphql', '-f', `query=${THREADS}`, '-f', `o=${repo.owner}`, '-f', `r=${repo.name}`, '-F', `n=${pr}`]));
  const threads = (((g.data || {}).repository || {}).pullRequest || {}).reviewThreads || { nodes: [] };
  return { ...v, threads: threads.nodes || [] };
}

function checks(s) {
  const out = [];
  for (const c of s.statusCheckRollup || []) {
    const name = c.name || c.context || 'check';
    // A status context in EXPECTED has not reported yet: pending, not passed.
    const result = c.conclusion || (c.status === 'COMPLETED' ? 'SUCCESS' : null) || (c.state && !['PENDING', 'EXPECTED'].includes(c.state) ? c.state : null);
    out.push({ name, result: result ? String(result).toUpperCase() : 'PENDING' });
  }
  return out;
}

// Every fact worth a line, keyed so it prints once.
function events(s) {
  const me = s.author && s.author.login;
  const head = (s.headRefOid || '').slice(0, 7);
  const ev = [];
  ev.push({ key: `head:${head}`, line: `head ${head}` });
  for (const c of checks(s)) {
    if (FAIL.has(c.result)) ev.push({ key: `check:${head}:${c.name}:fail`, line: `check failed: ${c.name} (${c.result.toLowerCase()})`, needs: true });
    else if (PASS.has(c.result)) ev.push({ key: `check:${head}:${c.name}:pass`, line: `check passed: ${c.name}` });
  }
  for (const r of s.reviews || []) {
    if (r.author && r.author.login === me) continue;
    const id = r.id || `${r.author && r.author.login}:${r.submittedAt}`;
    ev.push({ key: `review:${id}`, line: `review ${String(r.state).toLowerCase()} by ${r.author ? r.author.login : '?'}`, needs: r.state === 'CHANGES_REQUESTED' || r.state === 'COMMENTED' });
  }
  for (const c of s.comments || []) {
    if (c.author && c.author.login === me) continue;
    ev.push({ key: `comment:${c.id}`, line: `comment by ${c.author ? c.author.login : '?'}: ${String(c.body || '').split('\n')[0].slice(0, 80)}`, needs: true });
  }
  for (const t of s.threads) {
    const last = ((t.comments || {}).nodes || [])[0] || {};
    const who = last.author ? last.author.login : '?';
    if (!t.isResolved && who !== me) ev.push({ key: `thread:${t.id}:${last.id || who}`, line: `open thread on ${last.path || '?'} (last: ${who})`, needs: true });
  }
  if (s.mergeStateStatus === 'DIRTY') ev.push({ key: `conflict:${head}`, line: 'merge conflict with the base branch', needs: true });
  if (s.mergeStateStatus === 'BEHIND') ev.push({ key: `behind:${head}`, line: 'branch is behind the base branch' });
  if (s.state === 'MERGED') ev.push({ key: 'merged', line: 'merged' });
  if (s.state === 'CLOSED') ev.push({ key: 'closed', line: 'closed without merging', needs: true });
  return ev;
}

function verdict(s, until, fresh) {
  if (s.state === 'MERGED') return 0;
  if (s.state === 'CLOSED') return 1;
  const cs = checks(s);
  const failed = cs.some((c) => FAIL.has(c.result));
  const pending = cs.some((c) => c.result === 'PENDING');
  if (until === 'any-change') return fresh.length ? 0 : null;
  if (failed) return 1;
  if (until === 'green') return pending ? null : 0;
  if (s.mergeStateStatus === 'DIRTY') return 1;
  if (fresh.some((e) => e.needs)) return 1;
  // Already reported: wait for the re-review instead of exiting on every restart.
  if (s.reviewDecision === 'CHANGES_REQUESTED') return null;
  const open = s.threads.some((t) => !t.isResolved);
  if (!pending && !open) return 0;
  return null;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let repo;
  try {
    repo = repoOf(o);
  } catch (e) {
    console.error(`gh failed: ${String(e.stderr || e.message).trim()}`);
    process.exit(2);
  }
  const stateFile = path.join(os.tmpdir(), `pr-wait-${repo.owner}-${repo.name}-${o.pr}.json`);
  let st = { seen: [] };
  try {
    st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    // first run
  }
  if (st.pid && st.pid !== process.pid && alive(st.pid)) {
    console.error(`another pr-wait (pid ${st.pid}) already watches ${repo.owner}/${repo.name}#${o.pr}; not starting a second one`);
    process.exit(2);
  }
  const save = () => {
    try {
      fs.writeFileSync(stateFile, JSON.stringify(st));
    } catch {
      // not fatal
    }
  };
  st.pid = process.pid;
  save();
  const done = (code) => {
    st.pid = null;
    save();
    process.exit(code);
  };

  const deadline = Date.now() + o.timeout * 60000;
  let errors = 0;
  for (;;) {
    let s;
    try {
      s = snapshot(repo, o.pr);
      errors = 0;
    } catch (e) {
      errors += 1;
      console.log(`gh error (${errors}/3): ${String(e.stderr || e.message).split('\n')[0]}`);
      if (errors >= 3) done(2);
    }
    if (s) {
      const seen = new Set(st.seen);
      const fresh = events(s).filter((e) => !seen.has(e.key));
      for (const e of fresh) {
        console.log(e.line);
        seen.add(e.key);
      }
      st.seen = [...seen].slice(-500);
      save();
      const v = verdict(s, o.until, fresh);
      if (v !== null) {
        console.log(v === 0 ? (s.state === 'MERGED' ? 'done: merged' : `done: ${o.until}`) : 'needs you');
        done(v);
      }
    }
    if (Date.now() >= deadline) {
      console.log(`timeout after ${o.timeout} min; start pr-wait again to keep watching`);
      done(3);
    }
    await new Promise((r) => setTimeout(r, o.interval * 1000));
  }
}

main();
