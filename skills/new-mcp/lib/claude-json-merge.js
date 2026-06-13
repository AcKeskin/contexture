'use strict';

// Pure-Node merger for ~/.claude.json MCP server registration.
// Side-effect-free — takes an input object and returns a fresh result.
// The skill is responsible for reading and writing the file.

function mergeMcpServer(claudeJson, { name, type, command, args, env, scope, projectPath }) {
  const next = clone(claudeJson);

  if (scope === 'user') {
    if (!next.mcpServers) next.mcpServers = {};
    if (next.mcpServers[name]) return { status: 'duplicate' };
    next.mcpServers[name] = buildEntry(type, command, args, env);
  } else {
    // local scope: under projects.<projectPath>.mcpServers
    if (!next.projects) next.projects = {};
    if (!next.projects[projectPath]) next.projects[projectPath] = {};
    if (!next.projects[projectPath].mcpServers) next.projects[projectPath].mcpServers = {};
    if (next.projects[projectPath].mcpServers[name]) return { status: 'duplicate' };
    next.projects[projectPath].mcpServers[name] = buildEntry(type, command, args, env);
  }

  return { status: 'merged', next };
}

function buildEntry(type, command, args, env) {
  const entry = { type, command, args };
  if (env && Object.keys(env).length > 0) entry.env = env;
  return entry;
}

function formatJson(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

// LCS-based unified diff — same implementation as settings-merge.js
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
  while (i < n) ops.push({ kind: 'del', line: a[i++] });
  while (j < m) ops.push({ kind: 'add', line: b[j++] });
  return ops;
}

function renderHunks(ops, contextLines) {
  const lines = [];
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

module.exports = { mergeMcpServer, formatJson, unifiedDiff };
