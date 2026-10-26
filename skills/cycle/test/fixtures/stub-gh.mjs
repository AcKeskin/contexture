// Stand-in for `gh` in loop tests: records every call and keeps the PRs it opened
// in .claude/cycle/gh-state.json, so a test can see comments, ready and merges.
// STUB_OPEN_PRS answers a plain `pr list`; STUB_LABELED_PRS answers `pr list --label`;
// STUB_CHECKS=pass|fail sets the checks a view reports; STUB_MERGE_FAIL makes merges fail.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const cycle = join(process.cwd(), '.claude', 'cycle');
appendFileSync(join(cycle, 'gh-calls.log'), `${args.join(' ')}\n`);
const stateFile = join(cycle, 'gh-state.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { next: 100, prs: {}, comments: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = (v) => process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v));
const labeled = () => JSON.parse(process.env.STUB_LABELED_PRS || '[]');
const head = (branch) => spawnSync('git', ['rev-parse', `refs/heads/${branch}`], { encoding: 'utf8' }).stdout.trim() || 'unknown';
const CHECKS = {
  pass: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
  fail: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
};
const rollup = () => CHECKS[process.env.STUB_CHECKS] || [{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }, { conclusion: 'FAILURE' }];

if (args[0] === 'pr') {
  const n = args[2];
  switch (args[1]) {
    case 'list':
      if (flag('--head')) out(Object.values(state.prs).filter((p) => p.headRefName === flag('--head') && p.state === 'OPEN').map((p) => ({ url: p.url })));
      else if (flag('--label')) out(labeled());
      else out([...JSON.parse(process.env.STUB_OPEN_PRS || '[]'), ...Object.values(state.prs).filter((p) => p.state === 'OPEN').map((p) => ({ headRefName: p.headRefName }))]);
      break;
    case 'create': {
      const number = state.next++;
      const url = `https://github.com/example/repo/pull/${number}`;
      state.prs[number] = { number, url, title: flag('--title'), headRefName: flag('--head'), baseRefName: flag('--base'), state: 'OPEN', isDraft: true };
      save();
      out(`${url}\n`);
      break;
    }
    case 'view': {
      const own = state.prs[n];
      const other = labeled().find((p) => String(p.number) === n);
      if (own) out({ ...own, headRefOid: head(own.headRefName), labels: [], mergedAt: null, statusCheckRollup: rollup() });
      else if (other) out({ title: 'labeled work', url: `https://github.com/example/repo/pull/${n}`, state: 'OPEN', isDraft: false, baseRefName: 'main', labels: [{ name: 'cycle-merge' }], ...other, statusCheckRollup: rollup() });
      else out({ state: 'OPEN', isDraft: true, mergedAt: null, statusCheckRollup: rollup() });
      break;
    }
    case 'comment':
      state.comments.push({ number: Number(n), body: readFileSync(flag('--body-file'), 'utf8') });
      save();
      break;
    case 'ready':
      if (state.prs[n]) state.prs[n].isDraft = false;
      save();
      break;
    case 'merge':
      if (process.env.STUB_MERGE_FAIL) {
        process.stderr.write('GraphQL: Repository rule violations found\n');
        process.exit(1);
      }
      (state.merged ??= []).push({ number: Number(n), method: args[3] });
      if (state.prs[n]) state.prs[n].state = 'MERGED';
      save();
      break;
    default:
      break;
  }
}
