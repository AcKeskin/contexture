'use strict';

// Pure-Node merger for ~/.claude/settings.json hook registration.
// All functions are side-effect-free — they take an input object and return a
// fresh result. The skill is responsible for reading and writing the file.

function mergeHook(settings, { event, matcher, command, timeout = 5 }) {
  const next = clone(settings);
  if (!next.hooks) next.hooks = {};
  if (!Array.isArray(next.hooks[event])) next.hooks[event] = [];

  const eventArr = next.hooks[event];
  let matcherEntry = eventArr.find((e) => e && e.matcher === matcher);
  if (!matcherEntry) {
    matcherEntry = { matcher, hooks: [] };
    eventArr.push(matcherEntry);
  }
  if (!Array.isArray(matcherEntry.hooks)) matcherEntry.hooks = [];

  const duplicate = matcherEntry.hooks.some((h) => h && h.command === command);
  if (duplicate) return { status: 'duplicate' };

  matcherEntry.hooks.push({ type: 'command', command, timeout });
  return { status: 'merged', next };
}

function formatSettings(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

// LCS-based unified diff. Renders only the changed regions plus 3 lines of
// context above and below each hunk — enough for a confirmation prompt to be
// readable without dumping the whole file.
function unifiedDiff(beforeText, afterText, contextLines = 3) {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const ops = diffLines(a, b);
  if (!ops.some((op) => op.kind !== 'equal')) return '';
  return renderHunks(ops, contextLines).join('\n');
}

function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..n-1] and b[j..m-1]
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ kind: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: 'del', line: a[i++] });
  }
  while (j < m) {
    ops.push({ kind: 'add', line: b[j++] });
  }
  return ops;
}

function renderHunks(ops, contextLines) {
  const lines = [];
  // Find indices of every non-equal op, then expand each into a hunk with
  // context, merging adjacent hunks whose context windows overlap.
  const changedIdx = [];
  ops.forEach((op, idx) => {
    if (op.kind !== 'equal') changedIdx.push(idx);
  });
  if (changedIdx.length === 0) return lines;

  const hunks = [];
  let curStart = Math.max(0, changedIdx[0] - contextLines);
  let curEnd = Math.min(ops.length - 1, changedIdx[0] + contextLines);
  for (let k = 1; k < changedIdx.length; k++) {
    const idx = changedIdx[k];
    if (idx - contextLines <= curEnd + 1) {
      curEnd = Math.min(ops.length - 1, idx + contextLines);
    } else {
      hunks.push([curStart, curEnd]);
      curStart = Math.max(0, idx - contextLines);
      curEnd = Math.min(ops.length - 1, idx + contextLines);
    }
  }
  hunks.push([curStart, curEnd]);

  hunks.forEach(([start, end], hi) => {
    if (hi > 0) lines.push('@@');
    for (let idx = start; idx <= end; idx++) {
      const op = ops[idx];
      if (op.kind === 'equal') lines.push(`  ${op.line}`);
      else if (op.kind === 'del') lines.push(`- ${op.line}`);
      else lines.push(`+ ${op.line}`);
    }
  });
  return lines;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { mergeHook, formatSettings, unifiedDiff };
