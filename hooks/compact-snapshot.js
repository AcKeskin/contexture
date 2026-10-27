#!/usr/bin/env node
'use strict';

// Compaction state snapshot, two events, one script:
//   PreCompact            read the transcript, save a small snapshot
//   SessionStart compact  inject the snapshot back, then delete it
//
// The snapshot is what a summary tends to lose: the last real user request,
// files edited, open todos, and recent tool errors. Capped at MAX_CHARS.
// Fails open: no transcript or no snapshot means no output.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

const MAX_CHARS = 2000;
const TAIL_BYTES = 2 * 1024 * 1024;
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Last TAIL_BYTES of the transcript, parsed per line; partial first line dropped.
function readTranscript(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Skip a torn or non-JSON line.
      }
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

function blocks(entry) {
  const content = entry && entry.message && entry.message.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((b) => b.text || '').join(' ');
  return '';
}

function oneLine(s, n) {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 3) + '...' : flat;
}

// Todos come from TodoWrite (whole list each call) or from TaskCreate/TaskUpdate
// (one task per call; the id is in the TaskCreate result: "Task #3 created").
function collect(entries) {
  let request = '';
  const files = [];
  let todos = [];
  const tasks = new Map();
  const pendingCreates = new Map();
  const errors = [];
  for (const entry of entries) {
    const role = entry.message && entry.message.role;
    const meta = entry.isMeta || entry.isCompactSummary;
    for (const b of blocks(entry)) {
      if (role === 'user' && !meta && b.type === 'text' && b.text && !b.text.trim().startsWith('<')) request = b.text;
      if (b.type === 'tool_use' && EDIT_TOOLS.has(b.name)) {
        const f = b.input && (b.input.file_path || b.input.notebook_path);
        if (f) {
          const i = files.indexOf(f);
          if (i !== -1) files.splice(i, 1);
          files.push(f);
        }
      }
      if (b.type === 'tool_use' && b.name === 'TodoWrite' && b.input && Array.isArray(b.input.todos)) todos = b.input.todos;
      if (b.type === 'tool_use' && b.name === 'TaskCreate' && b.input) pendingCreates.set(b.id, b.input.subject || '');
      if (b.type === 'tool_use' && b.name === 'TaskUpdate' && b.input && tasks.has(String(b.input.taskId))) {
        const t = tasks.get(String(b.input.taskId));
        if (b.input.status) t.status = b.input.status;
        if (b.input.subject) t.content = b.input.subject;
      }
      if (b.type === 'tool_result' && pendingCreates.has(b.tool_use_id)) {
        const m = /Task #(\S+) created/.exec(resultText(b));
        if (m) tasks.set(m[1], { content: pendingCreates.get(b.tool_use_id), status: 'pending' });
        pendingCreates.delete(b.tool_use_id);
      }
      if (b.type === 'tool_result' && b.is_error) errors.push(resultText(b));
    }
  }
  const all = todos.concat([...tasks.values()]);
  return {
    request,
    files: files.slice(-10),
    todos: all.filter((t) => t.status !== 'completed' && t.status !== 'deleted').map((t) => `[${t.status}] ${t.content}`),
    errors: errors.slice(-3),
  };
}

function render(s) {
  const parts = ['State saved before compaction. Check the summary against it:'];
  if (s.request) parts.push('Last request: ' + oneLine(s.request, 500));
  if (s.todos.length) parts.push('Open todos:\n' + s.todos.map((t) => '- ' + oneLine(t, 120)).join('\n'));
  if (s.files.length) parts.push('Files edited:\n' + s.files.map((f) => '- ' + io.normalise(f)).join('\n'));
  if (s.errors.length) parts.push('Recent tool errors:\n' + s.errors.map((e) => '- ' + oneLine(e, 160)).join('\n'));
  if (parts.length === 1) return '';
  const text = parts.join('\n');
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 3) + '...' : text;
}

function save(payload) {
  if (!payload.transcript_path || !fs.existsSync(payload.transcript_path)) return;
  const text = render(collect(readTranscript(payload.transcript_path)));
  if (!text) return;
  const target = io.hookStateFile('compact', io.sessionId(payload));
  fs.writeFileSync(target, JSON.stringify({ savedAt: new Date().toISOString(), text }) + '\n');
}

function restore(payload) {
  const target = io.hookStateFile('compact', io.sessionId(payload));
  const snap = io.readJsonIfExists(target);
  if (!snap || !snap.text) return;
  try {
    fs.rmSync(target);
  } catch {
    // A leftover file is overwritten on the next compaction.
  }
  io.addContext('SessionStart', snap.text);
}

async function main() {
  const payload = await io.readPayload();
  if (payload.hook_event_name === 'PreCompact') save(payload);
  else if (payload.hook_event_name === 'SessionStart' && payload.source === 'compact') restore(payload);
  io.allow();
}

main().catch(() => io.allow());
