#!/usr/bin/env node
'use strict';

// SessionStart hook (matcher: clear | compact): when the previous session was
// cleared or compacted, scan its transcript for decisions that may never have
// been persisted, and — if none were recapped — inject a one-line nudge into
// the new session's context advising a /recap.
//
// Implements proposal 049 (clear-context decision guard), v2 design. The v1
// "advise at PreCompact" approach is not buildable: at PreCompact/SessionEnd,
// plain stdout on exit 0 goes to the debug log (model never sees it) and exit 2
// blocks (which a non-blocking guard must not do). SessionStart is the one
// lifecycle event whose stdout `{ context }` reaches the model on exit 0, so the
// guard recovers at the NEXT session start rather than preventing before the
// clear. The prior transcript persists on disk, so nothing is truly lost — it is
// recovered one turn late.
//
// Deliberately dumb: string/structure matching only, no model call, no
// embeddings. False positives are cheap (one extra recap prompt); false
// negatives are the expensive case, so the heuristics lean toward surfacing.
// Fails open — any error injects nothing rather than crashing session start.

const fs = require('fs');
const path = require('path');
const io = require('./lib/hook-io');

// Only fire when the previous session was discarded via clear or compact.
// `startup` / `resume` are normal session begins with nothing to recover.
const MATCHER_TARGETS = new Set(['clear', 'compact']);

// Decision-signal markers in assistant-authored text. Any one marks "a decision
// may be unpersisted". Lowercased before matching.
const DECISION_PHRASES = [
  'we decided',
  "let's go with",
  'lets go with',
  'chose ',
  ' over ', // "chose X over Y" — weak alone, but paired with other signals
  'the approach is',
  'settled on',
  'going with',
];

// Tool names whose presence in the transcript implies a decision was made.
const DECISION_TOOLS = new Set(['AskUserQuestion']);

// Filesystem markers of a design artefact landing this session.
const ARTEFACT_PATH_RE = /\.claude[\\/](specs|plans|docs)[\\/]|[\\/]proposals[\\/]\d{3}-/i;

async function main() {
  const payload = await io.readPayload();
  const matcher = payload.matcher || '';
  if (!MATCHER_TARGETS.has(matcher)) return io.allow();

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return io.allow();

  const events = readTranscript(transcriptPath);
  if (!events.length) return io.allow();

  const scan = scanForUnpersistedDecisions(events);
  if (!scan.signals.length) return io.allow();

  const preview = scan.signals.slice(0, 4).join('; ');
  const suffix = scan.signals.length > 4 ? `; +${scan.signals.length - 4} more` : '';
  const verb = matcher === 'clear' ? 'cleared' : 'compacted';
  const message =
    `Previous session was ${verb} and made decisions that may not be on disk: ${preview}${suffix}. ` +
    `Consider proposing /recap (and /capture for rule-tier items) before continuing — ` +
    `the prior transcript is still on disk to reconstruct from.`;

  process.stdout.write(JSON.stringify({ context: message }) + '\n');
  io.allow();
}

// Read a Claude Code transcript .jsonl into an array of parsed event objects.
// Malformed lines are skipped; a missing/unreadable file yields []. Reads the
// whole file — transcripts for a single session are small enough, and we need
// the recap-watermark ordering across the full session.
function readTranscript(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return events;
}

// Walk the transcript in order. Collect decision signals; track the index of the
// last signal and the index of the last recap-watermark (a recap skill run that
// wrote a sessions/<date>-*.md file). If the latest recap is after the latest
// signal, the decisions were persisted — return no signals.
function scanForUnpersistedDecisions(events) {
  const signals = [];
  let lastSignalIdx = -1;
  let lastRecapIdx = -1;

  events.forEach((ev, idx) => {
    if (eventIsRecapWatermark(ev)) {
      lastRecapIdx = idx;
      return;
    }
    const sig = decisionSignal(ev);
    if (sig) {
      signals.push({ idx, label: sig });
      lastSignalIdx = idx;
    }
  });

  // Everything was recapped after the last decision → nothing pending.
  if (lastRecapIdx > lastSignalIdx) return { signals: [] };

  // Only surface signals that postdate the last recap (older ones were saved).
  const pending = signals.filter((s) => s.idx > lastRecapIdx).map((s) => s.label);
  // De-duplicate while preserving order.
  return { signals: [...new Set(pending)] };
}

// A recap watermark: a tool use (Write) targeting a memory/sessions/*.md file.
// That is the persistence event — once it lands, decisions before it are saved.
function eventIsRecapWatermark(ev) {
  const calls = toolCalls(ev);
  for (const c of calls) {
    const name = c.name || '';
    if (name !== 'Write' && name !== 'Edit' && name !== 'MultiEdit') continue;
    const target = filePathArg(c);
    if (target && /[\\/]memory[\\/]sessions[\\/].+\.md$/i.test(target)) return true;
  }
  return false;
}

// Classify a single transcript event as a decision signal, returning a short
// human label or null. Order: tool-use signals first, then artefact writes, then
// assistant-text phrases.
function decisionSignal(ev) {
  const calls = toolCalls(ev);
  for (const c of calls) {
    if (DECISION_TOOLS.has(c.name)) return `${c.name} resolved (a choice was made)`;
    if (c.name === 'Write' || c.name === 'Edit' || c.name === 'MultiEdit') {
      const target = filePathArg(c);
      if (target && ARTEFACT_PATH_RE.test(target)) {
        return `design artefact edited (${path.basename(target)})`;
      }
    }
  }

  const text = assistantText(ev).toLowerCase();
  if (text) {
    for (const phrase of DECISION_PHRASES) {
      if (text.includes(phrase)) return `decision phrase ("${phrase.trim()}")`;
    }
  }
  return null;
}

// Extract tool-call descriptors from a transcript event, tolerant of shape
// drift across transcript-format versions. Returns [{ name, input }].
function toolCalls(ev) {
  const out = [];
  const content = messageContent(ev);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'tool_use' && block.name) {
        out.push({ name: block.name, input: block.input || {} });
      }
    }
  }
  return out;
}

// Pull the file-path argument out of a Write/Edit-shaped tool call.
function filePathArg(call) {
  const input = call.input || {};
  return input.file_path || input.path || input.notebook_path || '';
}

// Concatenate assistant-authored text blocks from an event, or '' if not an
// assistant message.
function assistantText(ev) {
  if (messageRole(ev) !== 'assistant') return '';
  const content = messageContent(ev);
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

// Transcript events nest the model message under `.message` in current formats;
// older shapes put role/content at top level. Tolerate both.
function messageContent(ev) {
  if (ev && ev.message && ev.message.content !== undefined) return ev.message.content;
  if (ev && ev.content !== undefined) return ev.content;
  return undefined;
}

function messageRole(ev) {
  if (ev && ev.message && ev.message.role) return ev.message.role;
  if (ev && ev.role) return ev.role;
  return '';
}

main().catch(() => io.allow());
