// Stand-in for `claude -p "/cycle <run> --stage <N>" ...` in loop tests. Does a
// stage's file work the way a real stage would, prints stream-json, and records
// the outcome through cycle-state. STUB_MODE picks a failure path.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const prompt = process.argv[process.argv.indexOf('-p') + 1];
if (prompt.startsWith('/visual critic ')) await critic(prompt.split(' ')[2]);
if (prompt.startsWith('/cycle review ')) review(...prompt.split(' ').slice(2));

/** The PR review session: STUB_REVIEW=changes always asks for changes, changes-once asks once, anything else approves. */
function review(number, folder) {
  const model = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'default';
  appendFileSync(join(process.cwd(), '.claude', 'cycle', 'stub-calls.log'), `review ${number} ${model}\n`);
  const count = join(process.cwd(), '.claude', 'cycle', 'stub-reviews.log');
  const first = !existsSync(count);
  appendFileSync(count, `${number}\n`);
  const changes = process.env.STUB_REVIEW === 'changes' || (process.env.STUB_REVIEW === 'changes-once' && first);
  const findings = changes ? [{ severity: 'High', file: 'a.txt', line: 1, claim: 'off-by-one in the loop bound', blocking: true }] : [];
  writeFileSync(join(folder, 'review.json'), JSON.stringify({ verdict: changes ? 'changes' : 'approve', summary: changes ? 'one blocking bug' : 'clean', findings }));
  writeFileSync(join(folder, 'comment.md'), `**Automated review (cycle)**\n\n${changes ? '- a.txt:1 off-by-one in the loop bound (blocking)' : 'No blocking findings.'}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'result', is_error: false, result: 'review done', total_cost_usd: 0.15 })}\n`);
  process.exit(0);
}
const [, run, , stage] = prompt.split(' ');

/** The visual critic: reads the script-built input and writes a verdict per state. STUB_VISUAL=revise-once asks for one revision. */
async function critic(runId) {
  const vdir = join(process.cwd(), '.claude', 'cycle', runId, 'visual');
  const input = JSON.parse(readFileSync(join(vdir, 'critic-input.json'), 'utf8'));
  const log = join(vdir, 'critic-calls.log');
  const first = !existsSync(log);
  appendFileSync(log, 'call\n');
  const revise = process.env.STUB_VISUAL === 'revise-once' && first;
  const verdicts = input.states.map((s) => (revise && s.touched
    ? { state: s.id, verdict: 'needs-revision', contract_line: 'tokens: color.accent', region: '10,10,10,10', evidence: 'accent box is off-palette', checked_against_code: true }
    : { state: s.id, verdict: 'consistent', contract_line: 'tokens: design/tokens.json', evidence: 'matches the tokens and the sibling', checked_against_code: true }));
  writeFileSync(join(vdir, 'verdicts.json'), JSON.stringify(verdicts));
  process.stdout.write(`${JSON.stringify({ type: 'result', is_error: false, result: 'critic done', total_cost_usd: 0.1 })}\n`);
  process.exit(0);
}
const repo = process.cwd();
const dir = join(repo, '.claude', 'cycle', run);
const mode = process.env.STUB_MODE || 'ok';
const calls = join(repo, '.claude', 'cycle', 'stub-calls.log');
const callNo = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).length + 1 : 1;
const model = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'default';
appendFileSync(calls, `${run} ${stage} ${model}\n`);

const say = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const result = (text, isError = false) => say({ type: 'result', is_error: isError, result: text, total_cost_usd: 0.25 });
const outcome = (state, note = '') => spawnSync(process.execPath, [process.env.CYCLE_STATE, 'outcome', run, stage, state, note, '--root', repo]);
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });

say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `stage ${stage} work` } }] } });

// Plan usage the way the CLI reports it: utilization 0-1, resetsAt in epoch seconds.
const nowS = Math.ceil(Date.now() / 1000);
const windows = {
  five_hour: { utilization: mode === 'fivehour' && callNo === 1 ? 0.9 : 0.1, resetsAt: nowS + 1, status: 'allowed' },
  seven_day: { utilization: mode === 'week' ? 0.9 : 0.05, resetsAt: nowS + 86400, status: 'allowed' },
};
say({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: windows } });

if (mode === 'error') {
  result('stage crashed', true);
  process.exit(1);
}
if (mode === 'auth') {
  result('Failed to authenticate: OAuth session expired and could not be refreshed.', true);
  process.exit(1);
}
if (mode === 'limit' && callNo === 1) {
  result('Claude usage limit reached. Your limit will reset at 5pm.', true);
  process.exit(0);
}

const slice = () => (readFileSync(join(dir, 'audit.md'), 'utf8').match(/## Confirmed slice\s+(\S+):/) || [])[1] || 'none';
// Named after the work the way stage 3 names it: feat/ for Missing or Adapt, fix/ for Polish.
const kind = () => (readFileSync(join(dir, 'audit.md'), 'utf8').match(new RegExp(`\\| ${slice()} \\| [^|]+ \\| (\\w+) \\|`)) || [])[1] || 'Missing';
const branch = () => `${kind() === 'Polish' ? 'fix' : 'feat'}/${slice().toLowerCase()}-${run}`;

switch (stage) {
  case '1': {
    const rows = mode === 'idle'
      ? '| A1 | rewrite everything | Missing | L | src/all.ts | no | open |'
      : '| A1 | add a confirm dialog | Missing | S | src/a.ts | no | open |\n| A2 | tidy the help overlay | Polish | M | src/b.ts | no | open |\n| A3 | new theme | Polish | S | styles.css | yes | open |\n| A4 | bump CI | Polish | S | .github/workflows/ci.yml | no | open |';
    writeFileSync(join(dir, 'audit.md'), `# Audit\n\n## Ranked\n\n| id | gap | kind | effort | files | taste | status |\n|---|---|---|---|---|---|---|\n${rows}\n`);
    outcome('done', 'audit ranked 4 gaps');
    break;
  }
  case '2':
    outcome('done', 'plan accepted under the run contract');
    break;
  case '3': {
    if (mode === 'block-first' && slice() === 'A1') {
      outcome('blocked', 'architecture fork: shared core or copy');
      break;
    }
    git('branch', branch(), 'main');
    // `git worktree add -b <branch> <path> origin/main` sets tracking like this by default.
    if (mode === 'track') git('branch', `--set-upstream-to=origin/main`, branch());
    if (mode !== 'nochange') {
      const wt = join(repo, '..', `wt-${run}`);
      spawnSync('git', ['-C', repo, 'worktree', 'add', '-q', wt, branch()]);
      writeFileSync(join(wt, `${slice()}.txt`), `work for ${slice()}\n`);
      spawnSync('git', ['-C', wt, 'add', `${slice()}.txt`]);
      // A visible change for draw-tree.mjs, unless STUB_VISUAL=same (a change nobody can see).
      if (process.env.STUB_VISUAL && process.env.STUB_VISUAL !== 'same') {
        writeFileSync(join(wt, 'look.json'), JSON.stringify({ box: '#c9a04e' }));
        spawnSync('git', ['-C', wt, 'add', 'look.json']);
      }
      spawnSync('git', ['-C', wt, 'commit', '-q', '-m', `added ${slice()}`]);
      // A visual run keeps its worktree: the loop captures the run branch from it.
      if (!process.env.STUB_VISUAL) spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt]);
    }
    outcome('done', `implemented on ${branch()}`);
    break;
  }
  case '4':
    // No captures here: in a repo with a visual contract the loop takes them after this stage.
    outcome('done', 'review round 1: 0 findings');
    break;
  case '5': {
    const contract = join(dir, 'contract.md');
    writeFileSync(contract, readFileSync(contract, 'utf8').replace(/evidence:$/gm, 'evidence: stub check passed'));
    writeFileSync(join(dir, 'pr.md'), `# ${slice()}: stub change\n\nWhat changed, before/after, rejected approaches.\n`);
    outcome('done', `branch=${branch()}`);
    break;
  }
  default:
    outcome('error', `unexpected stage ${stage}`);
}
// A real stage often keeps talking after it records the outcome; heartbeats fire meanwhile.
if (mode === 'late') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
result(`stage ${stage} finished`);
